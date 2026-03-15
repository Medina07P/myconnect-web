const https = require('https');
const http = require('http');

exports.handler = async (event) => {
  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) {
    return { statusCode: 400, body: 'Missing url' };
  }

  return new Promise((resolve) => {
    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve({ statusCode: 500, body: 'Too many redirects' });
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(reqUrl);
      } catch (e) {
        resolve({ statusCode: 400, body: `Invalid URL: ${reqUrl}` });
        return;
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Connection': 'keep-alive',
        },
        timeout: 25000,
      };

      const proxyReq = client.request(options, (proxyRes) => {
        if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307) {
          let location = proxyRes.headers.location;
          proxyRes.resume();

          // ✅ Resuelve URLs relativas
          if (location.startsWith('/')) {
            const port = parsedUrl.port ? `:${parsedUrl.port}` : '';
            location = `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${location}`;
          }

          makeRequest(location, redirectCount + 1);
          return;
        }

        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', () => {
          resolve({
            statusCode: 200,
            headers: {
              'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
            },
            body: Buffer.concat(chunks).toString('base64'),
            isBase64Encoded: true,
          });
        });
      });

      proxyReq.on('error', (e) => {
        resolve({ statusCode: 500, body: e.message });
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        resolve({ statusCode: 504, body: 'Timeout' });
      });

      proxyReq.end();
    };

    makeRequest(targetUrl);
  });
};