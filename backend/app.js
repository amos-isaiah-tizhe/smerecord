'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Fail fast if required env vars are missing
const required = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
}

const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp           = require('hpp');
const rateLimit     = require('express-rate-limit');
const morgan        = require('morgan');
const compression   = require('compression');
const cookieParser  = require('cookie-parser');
const path          = require('path');

const connectDB = require('./config/db');
const app       = express();

app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Dev: localhost:5000 (direct)
// Prod: allow CLIENT_URL only
const devOrigins = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV === 'production') {
      const allowed = [process.env.CLIENT_URL, process.env.RENDER_EXTERNAL_URL].filter(Boolean);
      return cb(null, allowed.includes(origin));
    }
    return cb(null, devOrigins.includes(origin));
  },
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: [
        "'self'",
        "https://challenges.cloudflare.com",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
      ],

      scriptSrcAttr: ["'none'"],

      frameSrc: [
        "https://challenges.cloudflare.com"
      ],

      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com",
      ],

      fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.gstatic.com",
        "data:",
      ],

      imgSrc: [
        "'self'",
        "data:",
        "https:",
      ],

      connectSrc: [
        "'self'",
        "https://challenges.cloudflare.com",
        "https://cdn.jsdelivr.net",
      ],

      frameAncestors: ["'none'"],
    },
  },

  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
app.use(mongoSanitize());
app.use(hpp());
// Compression is only useful in production; Render's CDN handles gzip on the
// edge anyway. In dev, skipping it keeps responses faster to inspect.
if (process.env.NODE_ENV === 'production') {
  app.use(compression());
}
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// ── RATE LIMITS ───────────────────────────────────────────────────────────────
const mkLimit = (max, msg) => rateLimit({
  windowMs: 15 * 60 * 1000, max,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: msg },
});

app.use(mkLimit(300, 'Too many requests. Please slow down.'));

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         mkLimit(20,  'Too many auth attempts.'),  require('./routes/auth'));
app.use('/api/books',                                                   require('./routes/books'));
app.use('/api/transactions',                                            require('./routes/transactions'));
app.use('/api/categories',                                              require('./routes/categories'));
app.use('/api/reports',                                                 require('./routes/reports'));
app.use('/api/admin/auth',   mkLimit(10,  'Too many admin attempts.'), require('./routes/adminAuth'));
app.use('/api/admin',                                                   require('./routes/admin'));

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── SERVE FRONTEND (same origin in dev AND prod) ─────────────────────────────
// Express serves the static SPA so the laptop dev workflow uses one port (5000)
// and frontend/api.js can hit "/api" relatively.
{
  const fp = path.join(__dirname, '../frontend');
  app.use(express.static(fp, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    extensions: ['html'],
  }));
  // SPA fallback — skip /api and /health so API 404s stay JSON
  app.get(/^(?!\/api|\/health).*$/, (_req, res) =>
    res.sendFile(path.join(fp, 'index.html'))
  );
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) =>
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` })
);

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  if (err.name === 'ValidationError')
    return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(', ') });
  if (err.code === 11000)
    return res.status(400).json({ success: false, message: `${Object.keys(err.keyValue || {})[0] || 'Field'} already exists` });
  if (err.name === 'JsonWebTokenError')
    return res.status(401).json({ success: false, message: 'Invalid token' });
  if (err.name === 'TokenExpiredError')
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  if (err.name === 'CastError')
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;

(async () => {
  await connectDB();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ API → http://localhost:${PORT}`);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🌐 API → http://localhost:${PORT}`);
    }
  });

  const stop = sig =>
    server.close(() => {
      console.log(`\n${sig} — stopped`);
      process.exit(0);
    });

  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
})();

module.exports = app;
