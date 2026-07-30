require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDatabase } = require('./init-db');

const authRoutes = require('./routes/auth');
const productosRoutes = require('./routes/productos');
const proveedoresRoutes = require('./routes/proveedores');
const usuariosRoutes = require('./routes/usuarios');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/publicaciones', require('./routes/publicaciones'));

const publicDir = path.join(__dirname, '..', 'public');

app.use(express.static(publicDir, {
  etag: false,
  maxAge: 0,
  index: false,
  setHeaders(res, filePath) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (filePath.endsWith('.js')) {
      res.type('application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.type('text/css');
    } else if (filePath.endsWith('.json')) {
      res.type('application/json');
    } else if (filePath.endsWith('.svg')) {
      res.type('image/svg+xml');
    }
  },
}));

// SPA fallback: solo rutas sin extensión (nunca .js/.css/etc.)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Archivo no encontrado');
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

async function start() {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Advertencia al inicializar DB:', err.message);
  }

  const server = app.listen(PORT, () => {
    const pidFile = path.join(__dirname, '..', '.server.pid');
    try {
      fs.writeFileSync(pidFile, String(process.pid));
    } catch (_) {
      /* ignore */
    }
    const cleanup = () => {
      try {
        fs.unlinkSync(pidFile);
      } catch (_) {
        /* ignore */
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
    console.log(`Carmina Store corriendo en http://localhost:${PORT}`);
  });

  // Tiempo amplio para subir fotos grandes a WebDAV
  const longMs = 10 * 60 * 1000;
  server.timeout = longMs;
  server.headersTimeout = longMs + 5000;
  server.requestTimeout = longMs;
  server.keepAliveTimeout = 120000;
}

start();
