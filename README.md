# LinkVault - Secure Link-Based File & Text Sharing

LinkVault is a LinkVault-like web app where you can upload text or a file and get a shareable link. Anyone with the exact link can view/download the content until it expires.

## Features

### Core Features
- **Text & File Upload**: Share plain text or any file type (up to 10MB)
- **Unique URL Generation**: Each upload gets a unique, hard-to-guess URL using nanoid
- **Access Control**: Content only accessible via exact link (no public listing)
- **Auto-Expiry**: Content automatically expires and deletes after specified duration
- **Secure Storage**: Files stored securely with unique identifiers

### Bonus Features
- **Password Protection**: Protect your pastes with a password
- **View Limits**: Set maximum number of views before auto-deletion
- **One-Time View**: Delete after the first successful view
- **Manual Deletion**: Delete content manually (with password if protected)
- **Custom Expiry**: Choose an expiry time
- **View Counter**: Track how many times content has been accessed
- **Authentication (JWT)**: Register/login and upload content as an authenticated user
- **Owner-only deletion**: If a paste is owned, only the owner can delete it
- **Clean UI**: Light theme and responsive layout
- **Auto-Cleanup**: Background job removes expired content

## Tech Stack

### Frontend
- **React 18** with Vite for fast development
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Axios** for API calls

### Backend
- **Node.js** runtime
- **Express.js** web framework
- **Multer** for file uploads
- **Node-cron** for scheduled tasks
- **nanoid** for unique ID generation

### Database
- **JSON-based file storage** (easy to migrate to MongoDB/PostgreSQL)
- File system for uploaded files

## Diagrams (Architecture and Data Flow)

The component architecture, database schema, and request/data-flow diagrams are documented in `ARCHITECTURE.md`.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- 10MB free disk space for uploads

## Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd <your-repo-folder>
```

### 2. Backend Setup

```bash
# Install backend dependencies
cd backend
npm install

# Create environment file
cp .env.example .env

# Edit .env if needed (optional)
# Default settings work out of the box
```

**Environment Variables** (`.env`):
```env
PORT=5000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
DEFAULT_EXPIRY_MINUTES=10
JWT_SECRET=change_me_to_random_secret
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,text/plain,application/pdf
STORAGE_PROVIDER=local
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install frontend dependencies
npm install
```

### 4. Running the Application

**Option A: Run Both Servers Separately**

Terminal 1 (Backend):
```bash
# From backend directory
cd backend
npm start
# Or for development with auto-reload:
npm run dev
```

Terminal 2 (Frontend):
```bash
# From frontend directory
cd frontend
npm run dev
```

**Option B: Production Build**

```bash
# Build frontend
cd frontend
npm run build

# Serve frontend from backend (setup required)
# Copy build files to backend public folder
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api

## API Overview

### Endpoints

#### 1. Upload Content
**POST** `/api/upload`

**Request (multipart/form-data)**:
```javascript
{
  text: "Your text content",      // OR
  file: File object,              // (only one of text/file)
  expiryMinutes: 10,              // Optional (default: 10)
  password: "secret123",          // Optional
  maxViews: 5,                    // Optional
  oneTimeView: true               // Optional (default: false)
}
```

**Response**:
```json
{
  "success": true,
  "id": "abc123xyz",
  "url": "http://localhost:3000/p/abc123xyz",
  "expiresAt": "2024-01-01T12:00:00.000Z",
  "type": "text"
}
```

#### 2. Get Paste
**GET** `/api/paste/:id?password=xxx`

**Response**:
```json
{
  "id": "abc123xyz",
  "type": "text",
  "content": "Your content here",
  "createdAt": "2024-01-01T11:50:00.000Z",
  "expiresAt": "2024-01-01T12:00:00.000Z",
  "views": 5,
  "passwordProtected": true,
  "oneTimeView": false
}
```

#### 3. Download File
**GET** `/api/download/:id?password=xxx`

Returns the file as a download stream.

#### 4. Delete Paste
**DELETE** `/api/paste/:id`

**Request Body**:
```json
{
  "password": "secret123"  // Required if password-protected
}
```

**Response**:
```json
{
  "success": true,
  "message": "Content deleted successfully"
}
```

### Error Codes

- `400` - Bad Request (invalid input)
- `401` - Unauthorized (wrong password)
- `404` - Not Found
- `410` - Gone (expired or view limit reached)
- `413` - Payload Too Large (file size exceeded)
- `500` - Internal Server Error

### Auth Endpoints

#### Register
**POST** `/api/auth/register`

#### Login
**POST** `/api/auth/login`

#### Current user
**GET** `/api/auth/me`

## Design Decisions

- **Link-based access**
  - I did not add any listing/search page for uploads. The only way to access content is by using the generated link.
- **ID generation with `nanoid`**
  - I used short random IDs to make links hard to guess.
- **Storage choice (JSON file + local uploads)**
  - For this assignment I used a simple JSON file database (`backend/data/db.json`) and stored uploaded files under `backend/uploads/`.
  - This keeps setup simple and makes it easy to run locally.
- **Expiry and cleanup**
  - Each paste has an `expiresAt`. A cron job runs regularly to remove expired pastes and delete their files.
- **Authentication (bonus)**
  - Auth is implemented using JWT.
  - Upload is allowed without login, but if you upload while logged in the paste is stored with `ownerId` and only the owner can delete it.

## UI Notes

### Responsive Design
- Mobile-first approach
- Breakpoints for tablet and desktop
- Touch-friendly interface
- Optimized for all screen sizes

### Accessibility
- Keyboard navigation support
- Screen reader friendly
- High contrast ratios
- Clear error messages

## Security Notes

1. **No Public Listing**: Content cannot be discovered without the exact URL
2. **Password Protection**: Optional password required to view/download/delete (when enabled)
3. **Unique IDs**: 10-character nanoid ensures URL unpredictability
4. **Auto-Expiry**: All content has expiration date
5. **View Limits**: Prevent unlimited access to sensitive data
6. **File Type Validation**: Server-side validation
7. **Size Limits**: Maximum 10MB per upload
8. **CORS Protection**: Configured for security

## Project Structure

```
LinkVault/
├── backend/               # Express backend
│   ├── server.js          # Express server
│   ├── database.js        # Database operations
│   ├── package.json       # Backend dependencies
│   └── .env.example       # Environment template
└── frontend/              # React frontend
    ├── src/
    │   ├── components/
    │   │   ├── Home.jsx         # Upload page
    │   │   └── ViewPaste.jsx    # View/download page
    │   ├── services/
    │   │   └── api.js           # API client
    │   ├── App.jsx              # Main app component
    │   ├── main.jsx             # Entry point
    │   └── index.css            # Global styles
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

## Background Jobs

The application runs a cron job every minute to:
- Find expired pastes
- Delete expired files from storage
- Clean up database entries


## Configuration Options

### Expiry Times
Customize in `Home.jsx`:
```javascript
<option value="5">5 minutes</option>
<option value="10">10 minutes</option>
<option value="30">30 minutes</option>
<option value="60">1 hour</option>
<option value="1440">24 hours</option>
<option value="10080">7 days</option>
```

### File Size Limit
Modify in `.env`:
```env
MAX_FILE_SIZE=10485760  # 10MB in bytes
```

### Cleanup Frequency
Modify in `server.js`:
```javascript
// Runs every minute
cron.schedule('* * * * *', async () => { ... });

// Run every hour
cron.schedule('0 * * * *', async () => { ... });
```


## Assumptions and Limitations

- **If you have the link, you have access**
  - This project relies on the link being hard to guess and shared only with intended users.
- **JSON database is for demo/assignment use**
  - The JSON file database is not ideal for high concurrency.
- **Local file storage**
  - Files are stored on the server file system, so this setup is not meant for multi-server deployments.
- **Paste password vs user password**
  - User account passwords are stored as a bcrypt hash.
  - Paste password protection uses the stored paste password to validate access.


