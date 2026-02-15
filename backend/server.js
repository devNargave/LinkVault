require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { nanoid } = require('nanoid');
const cron = require('node-cron');
const database = require('./database');
const cloudinary = require('cloudinary').v2;
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
const DEFAULT_EXPIRY_MINUTES = parseInt(process.env.DEFAULT_EXPIRY_MINUTES) || 10;
const FRONTEND_URL = process.env.FRONTEND_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'linkvault';
const cloudinaryEnabled =
  STORAGE_PROVIDER === 'cloudinary' &&
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function getTokenFromReq(req) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

function authOptional(req, _res, next) {
  const token = getTokenFromReq(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

function authRequired(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function getCloudinaryCandidateUrls(paste) {
  if (!paste?.cloudinaryPublicId || !cloudinaryEnabled) {
    return [paste?.fileUrl].filter(Boolean);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60; // 5 minutes
  const resourceType = paste.cloudinaryResourceType || 'raw';
  const version = paste.cloudinaryVersion || undefined;

  const variants = ['upload', 'authenticated', 'private'];
  const signedVariants = variants.map((t) =>
    cloudinary.url(paste.cloudinaryPublicId, {
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
      resource_type: resourceType,
      type: t,
      version,
    })
  );

  const ext = getFileExtension(paste.fileName);
  let privateDlUrl = null;
  try {
    if (ext) {
      privateDlUrl = cloudinary.utils.private_download_url(paste.cloudinaryPublicId, ext, {
        resource_type: resourceType,
      });
    }
  } catch {
    // ignore
  }

  return [
    ...signedVariants,
    privateDlUrl,
    getSignedCloudinaryUrl(paste),
    paste.fileUrl,
  ].filter(Boolean);
}

async function selectFirstAccessibleUrl(urls) {
  for (const url of urls) {
    const probe = await probeRemoteStatus(url);
    if (probe.status >= 200 && probe.status < 300) {
      return url;
    }
  }
  return null;
}

function streamRemoteFile(url, res, { fileName, mimeType, onFailure }) {
  const maxRedirects = 5;

  const requestOnce = (currentUrl, redirectsLeft) => {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      res.status(502).json({ error: 'Invalid remote download URL' });
      return;
    }

    const transport = parsed.protocol === 'http:' ? http : https;

    transport
      .get(parsed, (remoteRes) => {
        const status = remoteRes.statusCode || 0;
        const location = remoteRes.headers.location;

        if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
          remoteRes.resume();
          const nextUrl = new URL(location, parsed).toString();
          return requestOnce(nextUrl, redirectsLeft - 1);
        }

        if (status < 200 || status >= 300) {
          remoteRes.resume();
          console.error(`[download] remote fetch failed status=${status} url=${parsed.toString()}`);
          const msg = status === 401 || status === 403 ? 'Remote file is not publicly accessible' : 'Failed to fetch remote file';
          if (onFailure) {
            return onFailure({ status, url: parsed.toString(), message: msg });
          }
          res.status(502).json({ error: msg });
          return;
        }

        if (mimeType) {
          res.setHeader('Content-Type', mimeType);
        }
        const safeName = String(fileName || 'download').replace(/"/g, '');
        const dispositionType = res.locals?.downloadDisposition || 'attachment';
        res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeName}"`);

        remoteRes.pipe(res);
      })
      .on('error', (err) => {
        console.error('Remote download error:', err);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Failed to download file' });
        }
      });
  };

  requestOnce(url, maxRedirects);
}

function streamRemoteFileWithFallback(urls, res, opts) {
  const queue = (urls || []).filter(Boolean);
  const next = () => {
    const current = queue.shift();
    if (!current) {
      res.status(502).json({ error: 'Failed to fetch remote file' });
      return;
    }

    streamRemoteFile(current, res, {
      ...opts,
      onFailure: ({ status }) => {
        if ([401, 403, 404].includes(status)) {
          return next();
        }
        res.status(502).json({ error: 'Failed to fetch remote file' });
      },
    });
  };

  next();
}

function probeRemoteStatus(url) {
  const maxRedirects = 5;

  return new Promise((resolve) => {
    const requestOnce = (currentUrl, redirectsLeft) => {
      let parsed;
      try {
        parsed = new URL(currentUrl);
      } catch {
        resolve({ status: 0, finalUrl: currentUrl });
        return;
      }

      const transport = parsed.protocol === 'http:' ? http : https;
      const req = transport.request(
        parsed,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'LinkVault-Downloader',
            Range: 'bytes=0-0',
          },
        },
        (remoteRes) => {
          const status = remoteRes.statusCode || 0;
          const location = remoteRes.headers.location;
          remoteRes.resume();

          if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
            const nextUrl = new URL(location, parsed).toString();
            return requestOnce(nextUrl, redirectsLeft - 1);
          }

          resolve({ status, finalUrl: parsed.toString() });
        }
      );

      req.on('error', () => resolve({ status: 0, finalUrl: parsed.toString() }));
      req.end();
    };

    requestOnce(url, maxRedirects);
  });
}

function getFileExtension(fileName) {
  const ext = path.extname(fileName || '').replace('.', '');
  return ext || null;
}

function getSignedCloudinaryUrl(paste) {
  if (!paste?.cloudinaryPublicId || !cloudinaryEnabled) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60; // 5 minutes

  return cloudinary.url(paste.cloudinaryPublicId, {
    secure: true,
    sign_url: true,
    expires_at: expiresAt,
    resource_type: paste.cloudinaryResourceType || 'raw',
    type: paste.cloudinaryDeliveryType || 'upload',
    version: paste.cloudinaryVersion || undefined,
  });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const localDiskStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fsp.mkdir(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${nanoid()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: cloudinaryEnabled ? multer.memoryStorage() : localDiskStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.length === 0) return cb(null, true);
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    const err = new Error('File type not allowed');
    err.statusCode = 400;
    cb(err);
  }
});

function getCloudinaryResourceType(mimeType) {
  if (!mimeType) return 'raw';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

function uploadBufferToCloudinary({ buffer, originalName, mimeType }) {
  const resourceType = getCloudinaryResourceType(mimeType);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        resource_type: resourceType,
        use_filename: true,
        filename_override: originalName,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          deliveryType: result.type,
          version: result.version,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

// Helper function to calculate expiry date
function calculateExpiryDate({ expiryMinutes, expiresAt }) {
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      const err = new Error('Invalid expiresAt value');
      err.statusCode = 400;
      throw err;
    }
    return parsed;
  }

  const expiry = expiryMinutes || DEFAULT_EXPIRY_MINUTES;
  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + expiry);
  return expiryDate;
}

function getShareUrl(req, id) {
  if (FRONTEND_URL) {
    return `${FRONTEND_URL.replace(/\/$/, '')}/p/${id}`;
  }
  return `${req.protocol}://${req.get('host')}/p/${id}`;
}

// Helper function to verify password
function verifyPassword(paste, providedPassword) {
  if (!paste.password) return true;
  return paste.password === providedPassword;
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes('@') || String(password).length < 6) {
      return res.status(400).json({ error: 'Invalid email or password too short (min 6)' });
    }

    const existing = await database.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = {
      id: nanoid(12),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    await database.createUser(user);

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await database.getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), String(user.passwordHash || ''));
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const user = await database.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email });
  } catch (e) {
    console.error('Me error:', e);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Upload text or file
app.post('/api/upload', authOptional, upload.single('file'), async (req, res) => {
  try {
    const { text, expiryMinutes, expiresAt, password, maxViews, oneTimeView } = req.body;
    const file = req.file;

    // Validate: either text or file must be provided
    if (!text && !file) {
      return res.status(400).json({ 
        error: 'Either text or file must be provided' 
      });
    }

    if (text && file) {
      // Clean up uploaded file
      if (file && !cloudinaryEnabled) {
        await fsp.unlink(file.path).catch(() => {});
      }
      return res.status(400).json({ 
        error: 'Cannot upload both text and file simultaneously' 
      });
    }

    const id = nanoid(10);
    const computedExpiresAt = calculateExpiryDate({
      expiryMinutes: expiryMinutes != null ? parseInt(expiryMinutes) : undefined,
      expiresAt,
    });

    if (computedExpiresAt <= new Date()) {
      const err = new Error('Expiry must be in the future');
      err.statusCode = 400;
      throw err;
    }

    const pasteData = {
      id,
      type: text ? 'text' : 'file',
      createdAt: new Date().toISOString(),
      expiresAt: computedExpiresAt.toISOString(),
      views: 0,
      password: password || null,
      maxViews: maxViews ? parseInt(maxViews) : null,
      oneTimeView: oneTimeView === 'true' || oneTimeView === true,
      ownerId: req.user?.id || null,
    };

    if (text) {
      pasteData.content = text;
    } else {
      pasteData.fileName = file.originalname;
      pasteData.fileSize = file.size;
      pasteData.mimeType = file.mimetype;

      if (cloudinaryEnabled) {
        const uploaded = await uploadBufferToCloudinary({
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
        });
        pasteData.fileUrl = uploaded.url;
        pasteData.cloudinaryPublicId = uploaded.publicId;
        pasteData.cloudinaryResourceType = uploaded.resourceType;
        pasteData.cloudinaryDeliveryType = uploaded.deliveryType;
        pasteData.cloudinaryVersion = uploaded.version;

        // Reliable fallback: also store a local copy for downloads.
        await fsp.mkdir(UPLOAD_DIR, { recursive: true });
        const uniqueName = `${nanoid()}-${file.originalname}`;
        const localPath = path.join(UPLOAD_DIR, uniqueName);
        await fsp.writeFile(localPath, file.buffer);
        pasteData.filePath = localPath;
      } else {
        pasteData.filePath = file.path;
      }
    }

    await database.createPaste(pasteData);

    res.status(201).json({
      success: true,
      id,
      url: getShareUrl(req, id),
      expiresAt: computedExpiresAt.toISOString(),
      type: pasteData.type
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if it was uploaded
    if (req.file && !cloudinaryEnabled && req.file.path) {
      await fsp.unlink(req.file.path).catch(() => {});
    }
    
    res.status(error.statusCode || 500).json({ 
      error: error.statusCode ? error.message : 'Upload failed',
      message: error.statusCode ? undefined : error.message 
    });
  }
});

// Get paste by ID
app.get('/api/paste/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;

    const paste = await database.getPasteById(id);

    if (!paste) {
      return res.status(403).json({ error: 'Invalid link' });
    }

    // Check if expired
    const now = new Date();
    const expiryDate = new Date(paste.expiresAt);
    
    if (expiryDate <= now) {
      if (paste.type === 'file' && paste.cloudinaryPublicId && cloudinaryEnabled) {
        try {
          await cloudinary.uploader.destroy(paste.cloudinaryPublicId, {
            resource_type: paste.cloudinaryResourceType || 'raw',
            invalidate: true,
          });
        } catch (e) {
          console.error('Cloudinary delete error:', e);
        }
      }

      await database.deletePaste(id);
      return res.status(410).json({ error: 'Content has expired' });
    }

    // Check password protection
    if (paste.password && !verifyPassword(paste, password)) {
      return res.status(401).json({ 
        error: 'Password required',
        passwordProtected: true 
      });
    }

    // Check max views
    if (paste.maxViews && paste.views >= paste.maxViews) {
      await database.deletePaste(id);
      return res.status(410).json({ error: 'Maximum views reached' });
    }

    // Increment view count
    const updatedPaste = await database.incrementViewCount(id);

    // Handle one-time view
    if (paste.oneTimeView) {
      // Schedule deletion after response is sent
      setImmediate(async () => {
        await database.deletePaste(id);
      });
    }

    // Return paste metadata (not content for files)
    const response = {
      id: paste.id,
      type: paste.type,
      createdAt: paste.createdAt,
      expiresAt: paste.expiresAt,
      views: updatedPaste?.views ?? (paste.views + 1),
      passwordProtected: !!paste.password,
      oneTimeView: paste.oneTimeView
    };

    if (paste.type === 'text') {
      response.content = paste.content;
    } else {
      response.fileName = paste.fileName;
      response.fileSize = paste.fileSize;
      response.mimeType = paste.mimeType;
    }

    res.json(response);

  } catch (error) {
    console.error('Get paste error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve content',
      message: error.message 
    });
  }
});

// Download file
app.get('/api/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;
    const disposition = String(req.query.disposition || 'attachment').toLowerCase();
    res.locals.downloadDisposition = disposition === 'inline' ? 'inline' : 'attachment';

    const paste = await database.getPasteById(id);

    if (!paste) {
      return res.status(403).json({ error: 'Invalid link' });
    }

    if (paste.type !== 'file') {
      return res.status(400).json({ error: 'Not a file upload' });
    }

    // Check if expired
    const now = new Date();
    const expiryDate = new Date(paste.expiresAt);
    
    if (expiryDate <= now) {
      await database.deletePaste(id);
      return res.status(410).json({ error: 'File has expired' });
    }

    // Check password
    if (paste.password && !verifyPassword(paste, password)) {
      return res.status(401).json({ 
        error: 'Password required',
        passwordProtected: true 
      });
    }

    // Reliable download path: serve local copy if present
    if (paste.filePath) {
      const safeName = String(paste.fileName || 'download').replace(/"/g, '');
      if (paste.mimeType) res.setHeader('Content-Type', paste.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${res.locals.downloadDisposition}; filename="${safeName}"`
      );

      const fileStream = fs.createReadStream(paste.filePath);
      fileStream.on('error', (err) => {
        console.error('Download error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
      });
      return fileStream.pipe(res);
    }

    if (paste.fileUrl) {
      console.log(
        `[download] id=${id} cloudinaryEnabled=${cloudinaryEnabled} hasPublicId=${!!paste.cloudinaryPublicId}`
      );
      const candidates = getCloudinaryCandidateUrls(paste);
      const selected = await selectFirstAccessibleUrl(candidates);
      if (!selected) {
        return res.status(502).json({ error: 'Failed to fetch remote file' });
      }

      return streamRemoteFile(selected, res, {
        fileName: paste.fileName,
        mimeType: paste.mimeType,
      });
    }

    return res.status(404).json({ error: 'File not found' });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Download failed',
      message: error.message 
    });
  }
});

// Delete paste (manual deletion with password)
app.delete('/api/paste/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const paste = await database.getPasteById(id);

    if (!paste) {
      return res.status(403).json({ error: 'Invalid link' });
    }

    // If owned, only the owner (JWT) can delete
    if (paste.ownerId) {
      const token = getTokenFromReq(req);
      if (!token) return res.status(401).json({ error: 'Authentication required' });
      let payload;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
      if (payload.sub !== paste.ownerId) {
        return res.status(403).json({ error: 'Only the owner can delete this content' });
      }
    }

    // Check password if protected
    if (paste.password && !verifyPassword(paste, password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    await database.deletePaste(id);

    res.json({ success: true, message: 'Content deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      error: 'Deletion failed',
      message: error.message 
    });
  }
});

// Cleanup expired pastes (runs every minute)
cron.schedule('* * * * *', async () => {
  try {
    const expiredPastes = await database.getExpiredPastes();
    
    for (const paste of expiredPastes) {
      if (paste.type === 'file' && paste.cloudinaryPublicId && cloudinaryEnabled) {
        try {
          await cloudinary.uploader.destroy(paste.cloudinaryPublicId, {
            resource_type: paste.cloudinaryResourceType || 'raw',
            invalidate: true,
          });
        } catch (e) {
          console.error('Cloudinary cleanup delete error:', e);
        }
      }
      await database.deletePaste(paste.id);
      console.log(`Cleaned up expired paste: ${paste.id}`);
    }
    
    if (expiredPastes.length > 0) {
      console.log(`Cleaned up ${expiredPastes.length} expired paste(s)`);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'File too large',
        maxSize: MAX_FILE_SIZE 
      });
    }
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
  console.log(` Upload directory: ${UPLOAD_DIR}`);
  console.log(` Default expiry: ${DEFAULT_EXPIRY_MINUTES} minutes`);
  console.log(`Max file size: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB`);
});

module.exports = app;
