// Railway/Node entry point — sirve el build de CRA y expone las funciones
// de `api/*.js` (originalmente Vercel edge) como rutas Express. Cada archivo
// en api/ es un módulo ESM con `export default function handler(req, res)`;
// cargamos dinámicamente por ruta para evitar falsos positivos en arranque.

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const BUILD_DIR = path.join(ROOT, 'build');
const API_DIR = path.join(ROOT, 'api');

// CORS: en lugar del legacy "Access-Control-Allow-Origin: *", restringimos a
// los orígenes legítimos. Override via env var ALLOWED_ORIGINS (comma-separated).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS
  || 'https://solar-hub.co,https://www.solar-hub.co,https://cotiza.alebas.co')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Security headers via helmet. CSP idéntica a la de vercel.json para que
// el comportamiento sea consistente entre Railway y Vercel deploys.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://maps.googleapis.com", "https://maps.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://*.googleusercontent.com", "https://lh3.googleusercontent.com"],
      connectSrc: ["'self'", "https://api.solar-hub.co", "https://maps.googleapis.com", "https://solar.googleapis.com"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  // CRA compila assets en el mismo origen, no necesitamos COEP estricto.
  crossOriginEmbedderPolicy: false,
  // El embed de Google Maps requiere que el referrer sea origin completo
  // para que GCP valide la API key correctamente.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-alebas-token,authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Monta cada archivo api/*.js como ruta /api/<name>. La carga es dinámica
// (import()) porque los archivos son ESM y server.js es CommonJS.
//
// NOTA: la carpeta api/ está marcada DEPRECATED desde 2026-04-20 (ver
// api/DEPRECATED.md, fecha de eliminación sugerida 2026-05-04 — ya pasó).
// Cuando se confirme que ningún cliente externo llama /api/* directamente,
// eliminar la carpeta y este bloque.
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
  app.use(express.static(BUILD_DIR, {
    maxAge: '1h',
    index: false,
    setHeaders: (res, filePath) => {
      // CRA emite assets con hash en /static/{js,css,media} → long-term cache.
      if (/[\\/]static[\\/]/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
        // SW + manifest cambian a menudo y no llevan hash → no cachear.
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  }));
  app.get('*', (_req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(503).send('build/ no existe — corre `npm run build` primero.'));
}

app.listen(PORT, () => {
  console.log(`ALEBAS cotizador listening on :${PORT}`);
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
