const PROXY_URL = import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://myconnect-web-production.up.railway.app';

export const proxyUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://')) {
    return `${PROXY_URL}/api/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export { PROXY_URL };