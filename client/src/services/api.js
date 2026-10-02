import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('docspace_user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.id) {
        config.headers['x-user-id'] = String(user.id);
        config.params = { ...(config.params || {}), userId: user.id };
        if (config.data instanceof FormData) {
          config.data.append('userId', String(user.id));
        } else if (config.method !== 'get' && config.method !== 'delete') {
          const data = config.data || {};
          if (data.userId === undefined && !config.url.includes('/share')) {
            config.data = { ...data, userId: user.id };
          }
        }
      }
    }
  } catch { /* ignore */ }
  return config;
});

export function friendlyError(err, fallback) {
  const msg = err?.response?.data?.error;
  return typeof msg === 'string' && msg ? msg : fallback;
}

export default api;
