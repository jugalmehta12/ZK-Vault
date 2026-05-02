'use strict';

require('dotenv').config();

const http    = require('http');
const https   = require('https');
const selfsigned     = require('selfsigned');

const connectDB    = require('./config/db');
const { createApp } = require('./app');

const IS_DEV = process.env.NODE_ENV !== 'production';
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const PORT   = process.env.PORT || 5000;

// ─── Database ──────────────────────────────────────────────────────────────
connectDB();

const app = createApp();

// ─── Start Server ─────────────────────────────────────────────────────────
if (IS_DEV || !USE_HTTPS) {
  http.createServer(app).listen(PORT, () => {
    console.log(`\n🔐 ZK Vault  →  http://localhost:${PORT}  [${IS_DEV ? 'DEV' : 'PRODUCTION / HTTP'}]`);
    console.log('   ✅ Server stores: email, password hash, encrypted vault blob');
    console.log('   🚫 Server NEVER sees: master password, decrypted vault\n');
  });
} else {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems  = selfsigned.generate(attrs, { days: 365 });
  https.createServer({ key: pems.private, cert: pems.cert }, app).listen(PORT, () => {
    console.log(`\n🔐 ZK Vault  →  https://localhost:${PORT}  [PRODUCTION / HTTPS]`);
    console.log('   ✅ Server stores: email, password hash, encrypted vault blob');
    console.log('   🚫 Server NEVER sees: master password, decrypted vault\n');
  });
}
