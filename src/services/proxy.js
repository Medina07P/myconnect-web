// ✅ Intenta reproducir directo primero.
// Si falla por CORS, usa un proxy público como fallback.
export function getStreamUrl(url) {
  // Algunos streams sí funcionan directo en web
  // Los que no, los pasamos por un proxy CORS
  return url;
}

// Proxy público para streams que bloquean CORS
export function getProxiedUrl(url) {
  return `https://corsproxy.io/?${encodeURIComponent(url)}`;
}