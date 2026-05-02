'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

const { generalLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const vaultRoutes = require('./routes/vault');
const shareRoutes = require('./routes/shares');

function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      sanitizeObj(obj[key]);
    }
  }
  return obj;
}

function createApp() {
  const IS_DEV = process.env.NODE_ENV !== 'production';
  const PORT = process.env.PORT || 5000;
  const ORIGIN = IS_DEV ? `http://localhost:${PORT}` : (process.env.CLIENT_ORIGIN || `https://localhost:${PORT}`);

  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://api.pwnedpasswords.com'],
        imgSrc: ["'self'", 'data:'],
      },
    },
    hsts: IS_DEV ? false : { maxAge: 31536000, includeSubDomains: true },
  }));

  app.use(cors({ origin: ORIGIN, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

    // Note (Q-06): 'express-mongo-sanitize' is listed in package.json but is NOT used here.
    // Manual sanitization is done via the sanitizeObj() middleware above (removes $-prefixed keys).
    // You can safely remove express-mongo-sanitize from package.json by running:
    //   npm uninstall express-mongo-sanitize
  app.use((req, res, next) => {
    if (req.body) sanitizeObj(req.body);
    next();
  });

  app.use('/api', generalLimiter);

  app.use((req, res, next) => {
    if (!req.cookies['csrf-token']) {
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf-token', csrfToken, {
        httpOnly: false,
        sameSite: IS_DEV ? 'Lax' : 'Strict',
        secure: !IS_DEV,
      });
    }
    next();
  });

  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const cookieToken = req.cookies['csrf-token'];
      const headerToken = req.headers['x-csrf-token'];
      if (!cookieToken || cookieToken !== headerToken) {
        return res.status(403).json({ success: false, message: 'CSRF token mismatch.' });
      }
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
  });

  const frontendPath = path.resolve(__dirname, '..', 'frontend');
  const iconsPath = path.resolve(__dirname, '..', 'frontend', 'icons');

  app.use('/icons', express.static(iconsPath));
  app.use(express.static(frontendPath));

  app.use('/api/auth', authRoutes);
  app.use('/api/vault', vaultRoutes);
  app.use('/api/shares', shareRoutes);

  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack || err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };