const http = require('http');
const https = require('https');
const url = require('url');
const { spawn } = require('child_process');

const server = http.createServer((req, res) => {

  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
    return;
  }

  const parsed = url.parse(req.url, true);
  const targetUrl = parsed.query.url;
  const transcode = parsed.query.transcode === 'true';
  const live = parsed.query.live === 'true';

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

  // ── LIVE STREAM ──────────────────────────────────────────────
  if (live) {
    console.log(`→ Live: ${targetUrl}`);

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });

    const ffmpeg = spawn('ffmpeg', [
      '-i', targetUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => process.stdout.write('.'));
    ffmpeg.on('error', (e) => console.error('ffmpeg live error:', e.message));
    req.on('close', () => ffmpeg.kill('SIGKILL'));
    res.on('close', () => ffmpeg.kill('SIGKILL'));
    return;
  }

  // ── TRANSCODE VOD (con soporte de seek) ───────────────────────
  if (transcode) {
    console.log(`→ Probing: ${targetUrl}`);

    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      targetUrl,
    ]);

    let probeData = '';
    ffprobe.stdout.on('data', d => probeData += d);

    ffprobe.on('close', () => {
      let codec = 'hevc';
      let duration = 0;
      let bitrate = 0;

      try {
        const info = JSON.parse(probeData);
        const videoStream = info.streams?.find(s => s.codec_type === 'video');
        codec = videoStream?.codec_name || 'hevc';
        duration = parseFloat(info.format?.duration || 0);
        bitrate = parseInt(info.format?.bit_rate || 0);
      } catch (_) {}

      console.log(`→ Codec: ${codec} | Duración: ${duration.toFixed(1)}s | Bitrate: ${bitrate}`);

      // Estimar tamaño de salida para mapear byte-offset → tiempo
      // h264 copy: bitrate original + 128k audio
      // h265/otro: ~1.5 Mbps video (ultrafast crf30) + 96k audio
      const outputBps = codec === 'h264'
        ? (bitrate > 0 ? bitrate : 2000000) + 128000
        : 1700000;
      const estimatedSize = duration > 0 ? Math.floor((outputBps / 8) * duration) : 0;

      // Parsear Range header → calcular startTime
      let startTime = 0;
      let rangeStart = 0;
      let rangeEnd = estimatedSize > 0 ? estimatedSize - 1 : 0;
      let isRangeRequest = false;

      if (req.headers.range && estimatedSize > 0 && duration > 0) {
        const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          rangeStart = parseInt(match[1]);
          rangeEnd = match[2]
            ? Math.min(parseInt(match[2]), estimatedSize - 1)
            : estimatedSize - 1;
          startTime = (rangeStart / estimatedSize) * duration;
          isRangeRequest = true;
          console.log(`→ Seek: byte ${rangeStart}/${estimatedSize} → ${startTime.toFixed(1)}s`);
        }
      }

      // Construir args de ffmpeg
      // -ss ANTES de -i = fast seek (por keyframe, mucho más rápido)
      const ffmpegArgs = ['-ss', startTime.toFixed(3), '-i', targetUrl];

      if (codec === 'h264') {
        console.log('→ H.264: copy video + AAC audio');
        ffmpegArgs.push('-c:v', 'copy');
      } else {
        console.log('→ Transcoding H.265 → H.264');
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', '30',
          '-vf', 'scale=1280:720',
          '-g', '30',
        );
      }

      ffmpegArgs.push(
        '-c:a', 'aac',
        '-b:a', codec === 'h264' ? '128k' : '96k',
        '-movflags', 'frag_keyframe+empty_moov',
        '-f', 'mp4',
        'pipe:1',
      );

      // Headers de respuesta
      const responseHeaders = {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      };

      if (isRangeRequest) {
        responseHeaders['Content-Range'] = `bytes ${rangeStart}-${rangeEnd}/${estimatedSize}`;
        res.writeHead(206, responseHeaders);
      } else {
        // En la primera carga enviamos el tamaño estimado para que el seek bar aparezca
        if (estimatedSize > 0) {
          responseHeaders['Content-Length'] = estimatedSize.toString();
        }
        res.writeHead(200, responseHeaders);
      }

      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => process.stdout.write('.'));
      ffmpeg.on('error', e => {
        if (!e.message.includes('socket hang up')) console.error('ffmpeg error:', e.message);
      });
      req.on('close', () => ffmpeg.kill('SIGKILL'));
      res.on('close', () => ffmpeg.kill('SIGKILL'));
    });

    ffprobe.on('error', () => {
      // Fallback si ffprobe falla: transcode sin seek
      console.log('→ ffprobe falló, transcoding sin seek');
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
      });
      const ffmpeg = spawn('ffmpeg', [
        '-i', targetUrl,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', 'frag_keyframe+empty_moov',
        '-f', 'mp4',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      ffmpeg.stdout.pipe(res);
      req.on('close', () => ffmpeg.kill('SIGKILL'));
      res.on('close', () => ffmpeg.kill('SIGKILL'));
    });

    return;
  }

  // ── PROXY NORMAL ──────────────────────────────────────────────
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

        const isIpUrl = /\d+\.\d+\.\d+\.\d+/.test(new URL(location).hostname);
        const wasIpUrl = /\d+\.\d+\.\d+\.\d+/.test(parsedUrl.hostname);

        if (wasIpUrl && !isIpUrl) {
          console.log('⚠️ Loop detectado — usando IP directamente');
          const p2 = new URL(reqUrl);
          const c2 = p2.protocol === 'https:' ? https : http;
          const r2 = c2.request({
            hostname: p2.hostname,
            port: p2.port || 80,
            path: p2.pathname + p2.search,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
          }, (rs2) => {
            res.writeHead(200, {
              'Content-Type': rs2.headers['content-type'] || 'video/mp2t',
              'Access-Control-Allow-Origin': '*',
            });
            rs2.pipe(res);
          });
          r2.on('error', e => {
            if (!res.headersSent) { res.writeHead(500); res.end(e.message); }
          });
          r2.end();
          return;
        }

        makeRequest(location, redirectCount + 1);
        return;
      }

      const contentType = proxyRes.headers['content-type'] || '';
      const isM3U8 = contentType.includes('mpegurl') ||
                     contentType.includes('x-mpegurl') ||
                     reqUrl.includes('.m3u8') ||
                     reqUrl.includes('.m3u');

      if (isM3U8) {
        let body = '';
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          const baseUrl = reqUrl.substring(0, reqUrl.lastIndexOf('/') + 1);
          const PORT = process.env.PORT || 3001;
          const rewritten = body.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || trimmed === '') return line;
            let segmentUrl = trimmed;
            if (!segmentUrl.startsWith('http')) segmentUrl = baseUrl + segmentUrl;
            return `http://localhost:${PORT}/?url=${encodeURIComponent(segmentUrl)}`;
          }).join('\n');

          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          });
          res.end(rewritten);
        });
        return;
      }

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