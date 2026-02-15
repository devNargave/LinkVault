import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, FileText, Lock, Eye, Clock, AlertCircle, Check, Copy, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { uploadPaste, getAuthToken, logout } from '../services/api';

const Home = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('text'); // 'text' or 'file'
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null);
  const [expiryMinutes, setExpiryMinutes] = useState(10);
  const [expiresAt, setExpiresAt] = useState('');
  const [password, setPassword] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [oneTimeView, setOneTimeView] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [authed, setAuthed] = useState(!!getAuthToken());

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    navigate('/');
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const formData = new FormData();
      
      if (mode === 'text') {
        if (!textContent.trim()) {
          throw new Error('Please enter some text');
        }
        formData.append('text', textContent);
      } else {
        if (!file) {
          throw new Error('Please select a file');
        }
        formData.append('file', file);
      }

      if (expiresAt) {
        formData.append('expiresAt', new Date(expiresAt).toISOString());
      } else {
        formData.append('expiryMinutes', expiryMinutes);
      }
      if (password) formData.append('password', password);
      if (maxViews) formData.append('maxViews', maxViews);
      formData.append('oneTimeView', oneTimeView);

      const data = await uploadPaste(formData);
      setResult(data);
      setCopied(false);
      setPassword('');
      // Keep form values after success so the UI doesn't appear to "wipe" user input
      
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.url) {
      navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openUrl = () => {
    if (result?.url) {
      window.open(result.url, '_blank');
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-12">
          <div className="flex-1 text-center">
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-2 text-gray-900">
              LinkVault
            </h1>
          </div>

          <div className="flex gap-2">
            {authed ? (
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-gray-800 font-semibold transition-colors"
              >
                Logout
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-gray-800 font-semibold transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 border border-blue-600 rounded-lg text-white font-semibold transition-colors"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Main Upload Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow">
          {/* Mode Selector */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => setMode('text')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                mode === 'text'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FileText className="inline mr-2" size={18} />
              Text
            </button>
            <button
              onClick={() => setMode('file')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                mode === 'file'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Upload className="inline mr-2" size={18} />
              File
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Content Input */}
            {mode === 'text' ? (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Text content
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your text here..."
                  className="w-full h-64 bg-white border border-gray-300 rounded-lg p-4 text-gray-900 font-mono text-sm resize-none input-neon focus:border-blue-500 transition-colors"
                  required={mode === 'text'}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  File upload
                </label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                    required={mode === 'file'}
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center justify-center w-full h-32 bg-white border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
                  >
                    {file ? (
                      <div className="text-center">
                        <p className="text-gray-900 font-semibold">{file.name}</p>
                        <p className="text-gray-500 text-sm mt-1">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="mx-auto mb-2 text-gray-500" size={32} />
                        <p className="text-gray-700">Click to select file</p>
                        <p className="text-gray-500 text-xs mt-1">Max 10MB</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            )}

            {/* Expiry (always visible) */}
            <div>
              <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                <Clock className="mr-2 text-gray-600" size={16} />
                Expiry
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 input-neon focus:border-blue-500 mb-2"
              />
              <select
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(e.target.value)}
                disabled={!!expiresAt}
                className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 input-neon focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="360">6 hours</option>
                <option value="1440">24 hours</option>
                <option value="10080">7 days</option>
              </select>
            </div>

            {/* Additional Features Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 font-semibold hover:bg-gray-100 transition-colors"
            >
              <span>Additional features</span>
              {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showAdvanced && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Password */}
                <div>
                  <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                    <Lock className="mr-2 text-gray-600" size={16} />
                    Password <span className="ml-1 text-gray-500 text-xs">(optional)</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    name="upload_password"
                    placeholder="Leave empty for public access"
                    className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>

                {/* Max Views */}
                <div>
                  <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                    <Eye className="mr-2 text-gray-600" size={16} />
                    Max views <span className="ml-1 text-gray-500 text-xs">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={maxViews}
                    onChange={(e) => setMaxViews(e.target.value)}
                    placeholder="Unlimited"
                    min="1"
                    className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 input-neon focus:border-blue-500"
                  />
                </div>

                {/* One-time View */}
                <div className="flex items-center md:col-span-2">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={oneTimeView}
                      onChange={(e) => setOneTimeView(e.target.checked)}
                      className="w-5 h-5 rounded border border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    />
                    <span className="ml-3 text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                      One-time view (self-destruct after viewing)
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <Upload className="mr-2" size={20} />
                  Upload & Generate Link
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Success Result */}
        {result && (
          <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Check className="text-green-600" size={24} />
              <h2 className="text-2xl font-bold text-gray-900">Upload Successful!</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">
                  Your shareable link:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={result.url}
                    readOnly
                    className="flex-1 bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono text-sm"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <Check className="text-green-600" size={20} />
                    ) : (
                      <Copy className="text-gray-700" size={20} />
                    )}
                  </button>
                  <button
                    onClick={openUrl}
                    className="px-4 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="text-gray-700" size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Type</p>
                  <p className="text-gray-900 font-semibold">{result.type}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Expires</p>
                  <p className="text-gray-900 font-semibold">
                    {new Date(result.expiresAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {password && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-yellow-800 text-sm flex items-center">
                    <Lock className="mr-2" size={16} />
                    Password-protected. Share the password separately.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
