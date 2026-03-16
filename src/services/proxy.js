const PROXY_URL = import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://myconnect-web-production.up.railway.app';

export const proxyUrl = (url) => {
  // ✅ No proxear imágenes — solo streams de video
  // Las imágenes que fallen mostrarán placeholder por onError
  return url;
};

export { PROXY_URL };