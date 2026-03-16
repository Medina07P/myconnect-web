const PROXY_URL = import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://myconnect-web.onrender.com';

export const proxyUrl = (url) => {
  if (!url) return '';
  return url;
};

export { PROXY_URL };