# Zero-Knowledge Password Vault - Task Checklist

## Phase 1: Planning
- [x] Define project structure and architecture
- [x] Write implementation plan and get approval

## Phase 2: Project Setup
- [x] Initialize Node.js + Express backend
- [x] Set up MongoDB connection (Mongoose)
- [x] Configure environment variables (.env)
- [x] Set up HTTPS with self-signed certificate (selfsigned npm package)
- [x] Configure CORS, rate limiting, input sanitization, CSRF protection
- [x] Set up folder structure (frontend + backend)

## Phase 3: Backend - Auth & User Management
- [x] User model (email, password hash, MFA secret, encrypted vault blob)
- [x] Registration endpoint (POST /api/auth/register)
- [x] Login endpoint (POST /api/auth/login) with JWT
- [x] MFA setup endpoint (POST /api/auth/mfa/setup)
- [x] MFA verify endpoint (POST /api/auth/mfa/verify)
- [x] Auth middleware (JWT verification)
- [x] Logout endpoint (POST /api/auth/logout)

## Phase 4: Backend - Vault Management
- [x] Get vault endpoint (GET /api/vault)
- [x] Save vault endpoint (PUT /api/vault)
- [x] Vault model fields (encrypted blob, IV, salt)

## Phase 5: Frontend - UI Design
- [x] Base HTML layout with navigation
- [x] Global CSS with dark theme, glass morphism, animations
- [x] Login / Register page
- [x] Master password entry page (after login)
- [x] Main vault dashboard (list of password entries)
- [x] Add/Edit password modal
- [x] Password generator modal
- [x] Vault security score panel
- [x] Settings / MFA setup page

## Phase 6: Frontend - Zero-Knowledge Crypto (Web Crypto API)
- [x] PBKDF2 key derivation from master password + salt
- [x] AES-GCM encryption of vault
- [x] AES-GCM decryption of vault
- [x] Secure in-memory vault handling (no plaintext to server)
- [x] Clear memory on logout

## Phase 7: Frontend - Password Risk Intelligence
- [x] Password strength meter (entropy-based)
- [x] Duplicate password detection across vault entries
- [x] Weak password flagging
- [x] Old password detection (age > 90 days)
- [x] Have I Been Pwned (HIBP) API check (k-anonymity, client-side)
- [x] Vault Security Score calculation and display

## Phase 8: Security Features
- [x] HTTPS (selfsigned npm package)
- [x] Rate limiting (express-rate-limit)
- [x] Input sanitization (express-validator / mongoSanitize)
- [x] CSRF protection (double-submit cookie)
- [x] Helmet.js for security headers
- [x] JWT expiry (httpOnly, SameSite=Strict cookie)
- [x] bcrypt rounds=12 for server-side password hashing

## Phase 9: Verification & Testing
- [/] Test registration and login flow via browser
- [/] Test vault encryption/decryption round-trip
- [ ] Test HIBP check (client-side k-anonymity)
- [ ] Test password risk scoring
- [ ] Test MFA setup and verification
- [ ] Test rate limiting
- [ ] Verify server never logs/stores plaintext passwords or plaintext vault

## Phase 10: Final Polish
- [/] README.md with setup instructions
- [/] npm scripts (start, dev) in package.json
