const PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://proxy.cors.sh/${url}`,
];

export async function fetchM3U(url) {
  // Intenta directo primero
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
  } catch (_) {}

  // Prueba cada proxy
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (res.ok) return await res.text();
    } catch (_) {}
  }
  throw new Error('No se pudo cargar la lista M3U');
}

// ✅ Para streams de video — devuelve la URL proxeada que funcione
export function getProxiedStreamUrl(url) {
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}