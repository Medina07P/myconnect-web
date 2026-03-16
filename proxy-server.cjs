const http = require('http');
const https = require('https');
const url = require('url');
const { spawn } = require('child_process');

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const targetUrl = parsed.query.url;
  const transcode = parsed.query.transcode === 'true';

  if (!targetUrl) {
    res.writeHead(400);
    res.end('Missing url');
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ✅ Agrega este bloque ANTES del bloque if (transcode)
const live = parsed.query.live === 'true';

if (live) {
  console.log(`→ Live stream: ${targetUrl}`);

  // ffmpeg lee el stream y lo transmite como MPEG-TS
  // sin recodificar el video — solo copia los codecs
  const ffmpeg = spawn('ffmpeg', [
    '-re',                    // velocidad real
    '-i', targetUrl,          // ffmpeg sigue redirects automáticamente
    '-c:v', 'copy',           // ✅ copia video sin recodificar (mucho más rápido)
    '-c:a', 'aac',            // solo convierte el audio a AAC
    '-b:a', '128k',
    '-f', 'mpegts',           // formato MPEG-TS para streaming
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  res.writeHead(200, {
    'Content-Type': 'video/mp2t',
    'Access-Control-Allow-Origin': '*',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
  });

  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', (d) => {
    process.stdout.write('.');
  });

  ffmpeg.on('error', (e) => {
    console.error('ffmpeg live error:', e.message);
  });

  req.on('close', () => {
    console.log('Cliente desconectado — matando ffmpeg');
    ffmpeg.kill('SIGTERM');
  });

  return;
}

  if (transcode) {
  console.log(`→ Transcoding: ${targetUrl}`);

  // ✅ Primero obtener la duración con ffprobe
  const ffprobe = spawn('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    targetUrl,
  ]);

  let probeData = '';
  ffprobe.stdout.on('data', d => probeData += d);
  ffprobe.on('close', () => {
    let duration = 0;
    try {
      const info = JSON.parse(probeData);
      duration = parseFloat(info.format?.duration || 0);
    } catch (_) {}

    const responseHeaders = {
      'Content-Type': 'video/mp4',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked',
      'X-Content-Duration': String(duration),
    };

    if (duration > 0) {
      responseHeaders['Content-Duration'] = String(duration);
    }

    res.writeHead(200, responseHeaders);

    const ffmpeg = spawn('ffmpeg', [
  '-re',                      // ✅ velocidad real — evita buffer gigante
  '-i', targetUrl,
  '-c:v', 'libx264',
  '-preset', 'ultrafast',     // ya lo tienes
  '-tune', 'zerolatency',     // ✅ nuevo — reduce latencia al mínimo
  '-crf', '30',               // ✅ sube de 28 a 30 — menos calidad, menos CPU
  '-vf', 'scale=1280:720',    // ✅ nuevo — baja a 720p, mucho menos CPU
  '-c:a', 'aac',
  '-b:a', '96k',              // ✅ baja de 128k a 96k
  '-g', '30',                 // ✅ nuevo — keyframe cada 30 frames
  '-movflags', 'frag_keyframe+empty_moov+faststart',
  '-f', 'mp4',
  'pipe:1',
], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', (d) => {
      process.stdout.write('.');
    });
    ffmpeg.on('error', (e) => {
      console.error('ffmpeg error:', e.message);
    });
    req.on('close', () => ffmpeg.kill('SIGTERM'));
  });

  ffprobe.on('error', () => {
    // ffprobe falló — transmitir sin duración
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked',
    });
    const ffmpeg = spawn('ffmpeg', [
      '-i', targetUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    ffmpeg.stdout.pipe(res);
    req.on('close', () => ffmpeg.kill('SIGTERM'));
  });

  return;
}

  // ── Proxy normal sin transcodificación ──
  const makeRequest = (reqUrl, redirectCount = 0) => {
  if (redirectCount > 5) {
    res.writeHead(500);
    res.end('Too many redirects');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(reqUrl);
  } catch (e) {
    res.writeHead(400);
    res.end(`Invalid URL: ${reqUrl}`);
    return;
  }

  const client = parsedUrl.protocol === 'https:' ? https : http;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Connection': 'keep-alive',
  };
  if (req.headers.range) headers['Range'] = req.headers.range;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers,
    timeout: 30000,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307) {
  let location = proxyRes.headers.location;
  proxyRes.resume();

  if (location.startsWith('/')) {
    const port = parsedUrl.port ? `:${parsedUrl.port}` : '';
    location = `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${location}`;
  }

  console.log(`↪ Redirect: ${location}`);

  // ✅ FIX loop: si ya redirigimos a una IP y nos manda de vuelta
  // al dominio original, usamos la IP directamente sin seguir
  const isIpUrl = /\d+\.\d+\.\d+\.\d+/.test(new URL(location).hostname);
  const wasIpUrl = /\d+\.\d+\.\d+\.\d+/.test(parsedUrl.hostname);

  if (wasIpUrl && !isIpUrl) {
    // ✅ Estábamos en la IP y nos manda al dominio → ignorar, 
    // la IP ya tiene el stream
    console.log('⚠️ Loop detectado — usando la URL de la IP directamente');
    // Re-intentar la misma URL de IP pero sin seguir más redirects
    const ipUrl = reqUrl; // la URL actual que es la IP
    const client2 = https;
    const p2 = new URL(ipUrl);
    const c2 = p2.protocol === 'https:' ? https : http;
    const o2 = {
      hostname: p2.hostname,
      port: p2.port || 80,
      path: p2.pathname + p2.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
      },
    };
    const r2 = c2.request(o2, (rs2) => {
      res.writeHead(rs2.statusCode === 302 ? 200 : rs2.statusCode, {
        'Content-Type': rs2.headers['content-type'] || 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
      });
      rs2.pipe(res);
    });
    r2.on('error', e => { if (!res.headersSent) { res.writeHead(500); res.end(e.message); } });
    r2.end();
    return;
  }

  makeRequest(location, redirectCount + 1);
  return;
}

    const contentType = proxyRes.headers['content-type'] || '';

    // ✅ Detecta si es M3U8 por content-type O por extensión en la URL
    const isM3U8 = contentType.includes('mpegurl') ||
                   contentType.includes('x-mpegurl') ||
                   reqUrl.includes('.m3u8') ||
                   reqUrl.includes('.m3u');

    if (isM3U8) {
      // ✅ Reescribe el manifiesto para que todos los segmentos
      // pasen por el proxy
      let body = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        const baseUrl = reqUrl.substring(0, reqUrl.lastIndexOf('/') + 1);

        const rewritten = body.split('\n').map(line => {
          const trimmed = line.trim();

          // Ignorar comentarios y líneas vacías
          if (trimmed.startsWith('#') || trimmed === '') return line;

          // Es una URL de segmento o sub-playlist
          let segmentUrl = trimmed;
          if (!segmentUrl.startsWith('http')) {
            segmentUrl = baseUrl + segmentUrl;
          }

          // ✅ Los segmentos .ts pasan directo por el proxy (sin transcode)
          // Las sub-playlists .m3u8 también pasan por el proxy
          return `http://localhost:3001/?url=${encodeURIComponent(segmentUrl)}`;
        }).join('\n');

        console.log(`✅ M3U8 reescrito con ${body.split('\n').filter(l => !l.startsWith('#') && l.trim()).length} segmentos`);

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end(rewritten);
      });
      return;
    }

    // ✅ Stream directo (.ts, .avi, .mkv, etc.) — pipe directo
    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range',
      'Content-Type': contentType || 'video/mp2t',
    };
    if (proxyRes.headers['content-range']) responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
    if (proxyRes.headers['content-length']) responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
    if (proxyRes.headers['accept-ranges']) responseHeaders['Accept-Ranges'] = proxyRes.headers['accept-ranges'];

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('Error:', e.message);
    if (!res.headersSent) { res.writeHead(500); res.end(e.message); }
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) { res.writeHead(504); res.end('Timeout'); }
  });
  proxyReq.end();
};

  makeRequest(targetUrl);
});


const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Proxy server corriendo en http://localhost:${PORT}`);
});