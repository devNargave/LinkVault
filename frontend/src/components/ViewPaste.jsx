import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Copy, Download, Eye, Clock, Lock, Trash2, 
  AlertCircle, Check, FileText, File, Loader 
} from 'lucide-react';
import { getPaste, downloadFile, deletePaste } from '../services/api';

const ViewPaste = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const lastLoadedIdRef = useRef(null);
  
  const [paste, setPaste] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // React 18 StrictMode runs effects twice in dev, which would double-increment views.
    // This ensures we only load once per id.
    if (lastLoadedIdRef.current === id) return;
    lastLoadedIdRef.current = id;
    loadPaste();
  }, [id]);

  const loadPaste = async (pwd = null) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPaste(id, pwd);
      setPaste(data);
      setPasswordRequired(false);
    } catch (err) {
      if (err.response?.data?.passwordProtected) {
        setPasswordRequired(true);
        setError('This content is password-protected');
      } else if (err.response?.status === 410) {
        setError('This content has expired or reached its view limit');
      } else if (err.response?.status === 403) {
        setError('Invalid link');
      } else if (err.response?.status === 404) {
        setError('Content not found');
      } else {
        setError(err.response?.data?.error || 'Failed to load content');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    loadPaste(password);
  };

  const copyToClipboard = () => {
    if (paste?.content) {
      navigator.clipboard.writeText(paste.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const url = await downloadFile(id, password || null);
      window.location.href = url;
    } catch (err) {
      setError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await deletePaste(id, deletePassword || null);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Deletion failed');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const getTimeRemaining = () => {
    if (!paste?.expiresAt) return null;
    const now = new Date();
    const expiry = new Date(paste.expiresAt);
    const diff = expiry - now;
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="mx-auto mb-4 text-blue-600 animate-spin" size={48} />
          <p className="text-gray-600 font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  if (passwordRequired && !paste) {
    return (
      <div className="min-h-screen py-12 px-4 bg-gray-50">
        <div className="max-w-md mx-auto">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="text-center mb-6">
              <Lock className="mx-auto mb-4 text-gray-700" size={48} />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Required</h2>
              <p className="text-gray-600">This content is protected</p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  name="view_password"
                  placeholder="Enter password"
                  className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 input-neon focus:border-blue-500"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="text-red-400" size={20} />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (error && !paste) {
    return (
      <div className="min-h-screen py-12 px-4 bg-gray-50">
        <div className="max-w-md mx-auto">
          <div className="bg-white border border-red-200 rounded-xl p-6 shadow-sm text-center">
            <AlertCircle className="mx-auto mb-4 text-red-400" size={48} />
            <h2 className="text-2xl font-bold text-red-400 mb-2">Error</h2>
            <p className="text-gray-700 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 font-mono transition-colors"
          >
            ← Back to Home
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 font-mono transition-colors"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>

        {/* Info Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 grid md:grid-cols-4 gap-4 shadow-sm">
          <div className="flex items-center gap-2">
            {paste?.type === 'text' ? (
              <FileText className="text-gray-700" size={20} />
            ) : (
              <File className="text-gray-700" size={20} />
            )}
            <div>
              <p className="text-xs text-gray-500 uppercase">Type</p>
              <p className="text-gray-900 font-semibold">{paste?.type}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Eye className="text-gray-700" size={20} />
            <div>
              <p className="text-xs text-gray-500 uppercase">Views</p>
              <p className="text-gray-900 font-semibold">{paste?.views || 0}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="text-gray-700" size={20} />
            <div>
              <p className="text-xs text-gray-500 uppercase">Expires In</p>
              <p className="text-gray-900 font-semibold">{getTimeRemaining()}</p>
            </div>
          </div>

          {paste?.passwordProtected && (
            <div className="flex items-center gap-2">
              <Lock className="text-gray-700" size={20} />
              <div>
                <p className="text-xs text-gray-500 uppercase">Status</p>
                <p className="text-gray-900 font-semibold">Protected</p>
              </div>
            </div>
          )}

          {paste?.oneTimeView && (
            <div className="md:col-span-4 bg-yellow-50 border border-yellow-200 rounded p-2 text-center">
              <p className="text-yellow-800 text-sm font-semibold">
                ⚠️ One-time view - This content will self-destruct after viewing
              </p>
            </div>
          )}
        </div>

        {/* Content Display */}
        {paste?.type === 'text' ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Text Content</h2>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="text-green-600" size={16} />
                    <span className="text-green-700 text-sm font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="text-gray-700" size={16} />
                    <span className="text-gray-800 text-sm font-semibold">Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="code-block">
              <pre className="whitespace-pre-wrap break-words text-gray-900">
                {paste.content}
              </pre>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
            <div className="text-center">
              <File className="mx-auto mb-4 text-gray-700" size={64} />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{paste?.fileName}</h2>
              <p className="text-gray-600 mb-6">{formatFileSize(paste?.fileSize)}</p>

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {downloading ? (
                  <>
                    <Loader className="animate-spin" size={20} />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    Download File
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-md w-full shadow-lg">
            <h3 className="text-2xl font-bold text-red-400 mb-4">Delete Content</h3>
            <p className="text-gray-700 mb-6">
              This action cannot be undone. {paste?.passwordProtected && 'Enter the password to confirm deletion.'}
            </p>

            {paste?.passwordProtected && (
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="new-password"
                name="delete_password"
                placeholder="Enter password"
                className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 mb-4"
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewPaste;
