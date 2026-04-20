// Railway/Node entry point — sirve el build de CRA y expone las funciones
// de `api/*.js` (originalmente Vercel edge) como rutas Express. Cada archivo
// en api/ es un módulo ESM con `export default function handler(req, res)`;
// cargamos dinámicamente por ruta para evitar falsos positivos en arranque.

const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const BUILD_DIR = path.join(ROOT, 'build');
const API_DIR = path.join(ROOT, 'api');

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

// Monta cada archivo api/*.js como ruta /api/<name>. La carga es dinámica
// (import()) porque los archivos son ESM y server.js es CommonJS.
if (fs.existsSync(API_DIR)) {
  const files = fs.readdirSync(API_DIR).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    const route = `/api/${name}`;
    app.all(route, async (req, res) => {
      try {
        const mod = await import(path.join(API_DIR, file));
        const handler = mod.default || mod.handler;
        if (typeof handler !== 'function') {
          return res.status(500).json({ error: `${route}: sin export default` });
        }
        return handler(req, res);
      } catch (e) {
        console.error(`[${route}]`, e);
        return res.status(500).json({ error: `${route}: ${e.message}` });
      }
    });
    console.log(`→ mounted ${route}`);
  }
}

// Static + SPA fallback.
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(503).send('build/ no existe — corre `npm run build` primero.'));
}

app.listen(PORT, () => console.log(`ALEBAS cotizador listening on :${PORT}`));
