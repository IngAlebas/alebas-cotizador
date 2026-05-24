// Railway/Node entry point — sirve el build de CRA en producción.
// Las rutas de API han sido migradas a workflows n8n (api.solar-hub.co).
// Ver api/DEPRECATED.md (eliminado en abril 2026) y n8n/ para el mapeo completo.

const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const BUILD_DIR = path.join(ROOT, 'build');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// CORS permisivo — la base URL pública se usa desde el propio origen,
// pero n8n y herramientas externas pueden golpear /api/* directamente.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-alebas-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Static + SPA fallback.
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(503).send('build/ no existe — corre `npm run build` primero.'));
}

app.listen(PORT, () => console.log(`ALEBAS cotizador listening on :${PORT}`));
