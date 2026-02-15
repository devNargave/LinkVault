const fs = require('fs').promises;
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'db.json');
    this.uploadsDir = path.join(__dirname, 'uploads');
    this.legacyDbPath = path.join(__dirname, '..', 'data', 'db.json');
    this.legacyUploadsDir = path.join(__dirname, '..', 'uploads');
    this.init();
  }

  async init() {
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
      
      // Create uploads directory if it doesn't exist
      await fs.mkdir(this.uploadsDir, { recursive: true });

      // Migration: if old root-level DB exists and new DB doesn't, copy it over
      try {
        await fs.access(this.dbPath);
      } catch {
        try {
          await fs.access(this.legacyDbPath);
          const legacy = await fs.readFile(this.legacyDbPath, 'utf8');
          await fs.writeFile(this.dbPath, legacy);
        } catch {
          // ignore
        }
      }

      // Migration: if old root-level uploads dir exists and backend uploads is empty, copy files
      try {
        const backendFiles = await fs.readdir(this.uploadsDir).catch(() => []);
        if (backendFiles.length === 0) {
          const legacyFiles = await fs.readdir(this.legacyUploadsDir).catch(() => []);
          for (const f of legacyFiles) {
            const from = path.join(this.legacyUploadsDir, f);
            const to = path.join(this.uploadsDir, f);
            await fs.copyFile(from, to).catch(() => {});
          }
        }
      } catch {
        // ignore
      }
      
      // Initialize database file if it doesn't exist
      try {
        await fs.access(this.dbPath);
      } catch {
        await fs.writeFile(this.dbPath, JSON.stringify({ pastes: [] }, null, 2));
      }
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }

  async read() {
    try {
      const data = await fs.readFile(this.dbPath, 'utf8');
      const parsed = JSON.parse(data);
      // Ensure expected top-level collections exist
      if (!parsed.pastes) parsed.pastes = [];
      if (!parsed.users) parsed.users = [];
      return parsed;
    } catch (error) {
      console.error('Database read error:', error);
      return { pastes: [], users: [] };
    }
  }

  async write(data) {
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Database write error:', error);
      throw error;
    }
  }

  async createUser(userData) {
    const db = await this.read();
    db.users.push(userData);
    await this.write(db);
    return userData;
  }

  async getUserByEmail(email) {
    const db = await this.read();
    return db.users.find((u) => u.email === email);
  }

  async getUserById(id) {
    const db = await this.read();
    return db.users.find((u) => u.id === id);
  }

  async createPaste(pasteData) {
    const db = await this.read();
    db.pastes.push(pasteData);
    await this.write(db);
    return pasteData;
  }

  async getPasteById(id) {
    const db = await this.read();
    return db.pastes.find(paste => paste.id === id);
  }

  async updatePaste(id, updates) {
    const db = await this.read();
    const index = db.pastes.findIndex(paste => paste.id === id);
    
    if (index === -1) return null;
    
    db.pastes[index] = { ...db.pastes[index], ...updates };
    await this.write(db);
    return db.pastes[index];
  }

  async deletePaste(id) {
    const db = await this.read();
    const paste = db.pastes.find(p => p.id === id);
    
    if (!paste) return false;
    
    // Delete associated file if exists
    if (paste.type === 'file' && paste.filePath) {
      try {
        await fs.unlink(paste.filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }
    
    db.pastes = db.pastes.filter(paste => paste.id !== id);
    await this.write(db);
    return true;
  }

  async getExpiredPastes() {
    const db = await this.read();
    const now = new Date();
    return db.pastes.filter(paste => {
      const expiryDate = new Date(paste.expiresAt);
      return expiryDate <= now;
    });
  }

  async incrementViewCount(id) {
    const db = await this.read();
    const index = db.pastes.findIndex(paste => paste.id === id);
    
    if (index === -1) return null;
    
    db.pastes[index].views = (db.pastes[index].views || 0) + 1;
    await this.write(db);
    return db.pastes[index];
  }
}

module.exports = new Database();
