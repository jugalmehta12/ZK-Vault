# 🔐 ZK Vault — Zero-Knowledge Password Manager

A **production-quality**, full-stack password manager where the server **mathematically cannot** read your vault.

## Architecture

```
SGP/
├── backend/                 ← Node.js + Express HTTPS API
│   ├── config/db.js         ← MongoDB connection
│   ├── middleware/
│   │   ├── auth.js          ← JWT cookie verification
│   │   ├── rateLimiter.js   ← express-rate-limit (10 login/15min)
│   │   └── sanitize.js      ← express-validator + input rules
│   ├── models/User.js       ← Mongoose schema (vault stored as ciphertext)
│   ├── routes/
│   │   ├── auth.js          ← /api/auth/* (register, login, MFA)
│   │   └── vault.js         ← /api/vault  (GET/PUT encrypted blob)
│   ├── server.js            ← HTTPS entry point
│   └── .env                 ← Environment config
│
└── frontend/
    ├── index.html           ← Login / Register + Master password screen
    ├── vault.html           ← Main vault dashboard
    ├── css/style.css        ← Dark glassmorphism theme
    └── js/
        ├── crypto.js        ← PBKDF2 + AES-GCM (Web Crypto API)
        ├── risk.js          ← HIBP + strength + vault score
        ├── generator.js     ← Secure password generator
        ├── auth.js          ← API calls + vault unlock
        ├── vault.js         ← In-memory vault store + CRUD
        └── app.js           ← UI orchestrator
```

## Prerequisites

| Tool | Required Version |
|------|-----------------|
| Node.js | ≥ 18.x |
| MongoDB | Running locally on port 27017 |
| npm | ≥ 9.x |

## Setup & Run

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
# Edit backend/.env:
MONGO_URI=mongodb://localhost:27017/zk_vault
JWT_SECRET=your_very_long_random_secret_here_min_64_chars
PORT=5000
NODE_ENV=development
```

### 3. Start MongoDB
```bash
# Windows (MongoDB installed as service):
net start MongoDB
# Or manually:
mongod --dbpath "C:\data\db"
```

### 4. Start the server
```bash
npm start
# Or for live reload during development:
npm run dev
```

### 5. Open the app
Navigate to **https://localhost:5000** in your browser.

> ⚠️ Your browser will warn about the self-signed certificate. Click **"Advanced" → "Proceed"** — this is expected for local development.

---

## Zero-Knowledge Security Model

```
User enters Master Password
       ↓ (never sent to server)
PBKDF2 (310,000 iter, SHA-256)
       ↓
AES-GCM-256 Key  (kept in browser memory only)
       ↓
Encrypt Vault JSON  →  Ciphertext + IV
       ↓
Send { encryptedVault, vaultIV, vaultSalt } → Server
```

**The server stores only:**
- `email` (plain)
- `passwordHash` (bcrypt, rounds=12) — different from master password
- `encryptedVault` (base64 AES-GCM ciphertext — opaque to server)
- `vaultIV`, `vaultSalt` (metadata for decryption, not secrets)

**The server NEVER sees:**
- Master password
- Decrypted vault contents

---

## Security Features

| Feature | Details |
|---------|---------|
| HTTPS | `selfsigned` npm — auto-generated in Node.js |
| Helmet | Sets 11 HTTP security headers |
| CSRF | Double-submit cookie pattern (X-CSRF-Token header) |
| Rate Limiting | 10 login attempts / 15 min |
| Input Validation | `express-validator` on all endpoints |
| Mongo Injection | `express-mongo-sanitize` strips `$` operators |
| JWT | 2h expiry, httpOnly + Secure + SameSite=Strict cookie |
| bcrypt | Server-side password hashed with 12 rounds |
| HIBP Check | k-anonymity (only first 5 chars of SHA-1 sent to API) |
| MFA | TOTP via `speakeasy` (Google Authenticator compatible) |

## Advanced Features Added

- Automated backend + crypto flow tests (Jest + Supertest)
- Security audit logging for auth + vault events
- Vault version history with rollback API
- Encrypted export/import backups with separate passphrase
- Zero-knowledge account recovery blob configuration
- Device/session management (list/revoke sessions)
- Password health dashboard (weak/reused/breached/old)
- CI pipeline with lint, tests, and `npm audit`

## Running Quality Checks

```bash
cd backend
npm run lint
npm test
```

---

## API Endpoints

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login (+ optional MFA) | No |
| POST | `/api/auth/logout` | Clear JWT cookie | No |
| GET | `/api/auth/me` | Current user info | Yes |
| POST | `/api/auth/mfa/setup` | Generate TOTP secret + QR | Yes |
| POST | `/api/auth/mfa/verify` | Enable MFA | Yes |
| POST | `/api/auth/mfa/disable` | Disable MFA | Yes |
| GET | `/api/vault` | Get encrypted vault | Yes |
| PUT | `/api/vault` | Save encrypted vault | Yes |

---

## Technology Stack

### Backend
- **Node.js + Express** — REST API
- **MongoDB + Mongoose** — Data persistence
- **bcryptjs** — Server-side password hashing
- **jsonwebtoken** — Session auth (httpOnly cookies)
- **helmet** — Security HTTP headers
- **express-rate-limit** — Brute-force protection
- **speakeasy + qrcode** — TOTP MFA
- **selfsigned** — Local HTTPS certificates

### Frontend
- **Vanilla HTML + CSS + JavaScript** — No framework
- **Web Crypto API** — Native browser encryption
  - `crypto.subtle.deriveKey` (PBKDF2)
  - `crypto.subtle.encrypt/decrypt` (AES-GCM)
  - `crypto.subtle.digest` (SHA-1 for HIBP)
- **Have I Been Pwned API** — k-anonymity breach checking

---

## Verification Checklist

After starting the server, verify these:

1. **Register** → Login → Enter master password → Vault opens ✓
2. **Network tab** → `PUT /api/vault` body contains only base64 ciphertext ✓
3. **MongoDB Compass** → `users.encryptedVault` is unreadable ciphertext ✓
4. **Add entry with "password123"** → Breach warning appears ✓
5. **Rate limiter** → 11 rapid login attempts → 429 Too Many Requests ✓
6. **Logout** → page clears → re-login required ✓
