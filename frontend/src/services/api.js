import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'linkvault_token';

export const getAuthToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAuthToken = (token) => {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const register = async ({ email, password }) => {
  const response = await api.post('/auth/register', { email, password });
  if (response.data?.token) setAuthToken(response.data.token);
  return response.data;
};

export const login = async ({ email, password }) => {
  const response = await api.post('/auth/login', { email, password });
  if (response.data?.token) setAuthToken(response.data.token);
  return response.data;
};

export const me = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const logout = async () => {
  setAuthToken(null);
};

export const uploadPaste = async (formData) => {
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getPaste = async (id, password = null) => {
  const response = await api.get(`/paste/${id}`, {
    params: password ? { password } : {},
  });
  return response.data;
};

export const downloadFile = async (id, passwordOrOptions = null) => {
  const base = API_BASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (typeof passwordOrOptions === 'string' && passwordOrOptions) {
    params.set('password', passwordOrOptions);
  } else if (passwordOrOptions && typeof passwordOrOptions === 'object') {
    if (passwordOrOptions.password) params.set('password', passwordOrOptions.password);
    if (passwordOrOptions.disposition) params.set('disposition', passwordOrOptions.disposition);
  }
  return `${base}/download/${id}${params.toString() ? `?${params.toString()}` : ''}`;
};

export const deletePaste = async (id, password = null) => {
  const response = await api.delete(`/paste/${id}`, {
    data: password ? { password } : {},
  });
  return response.data;
};

export default api;
