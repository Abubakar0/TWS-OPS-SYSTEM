import http from 'node:http';
import https from 'node:https';

const targetOrigin = 'https://tws-ops-system-backend-staging.up.railway.app';
const targetBase = new URL('/api', targetOrigin);
const port = 4000;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:4201',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, corsHeaders);
    res.end('Missing request URL');
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const incomingUrl = new URL(req.url, `http://localhost:${port}`);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, targetOrigin);

  const upstream = https.request(
    upstreamUrl,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: targetBase.host,
        origin: targetOrigin,
        referer: targetOrigin,
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 500, {
        ...upstreamRes.headers,
        ...corsHeaders,
      });
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ message: `Proxy error: ${error.message}` }));
  });

  req.pipe(upstream);
});

server.listen(port, () => {
  console.log(`Local staging proxy listening on http://localhost:${port}`);
});
