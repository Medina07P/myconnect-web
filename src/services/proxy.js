const PROXY_URL = import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://myconnect-web.onrender.com';

export const proxyUrl = (url) => {
  if (!url) return '';
  // ✅ Proxy imágenes HTTP a través de wsrv.nl (CDN gratuito)
  if (url.startsWith('http://')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=100&h=100`;
  }
  return url;
};

export { PROXY_URL };