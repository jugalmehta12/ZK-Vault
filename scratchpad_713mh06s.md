# Verification Plan for Zero-Knowledge Password Vault

## Steps:
- [ ] Step 1: Landing Page - Navigate to `https://localhost:5000`, bypass certificate warning, and take a screenshot.
- [ ] Step 2: Register - Create account with `demo@zkvault.dev`, `Demo@Vault99!`, and take a screenshot.
- [ ] Step 3: Master Password Screen - Enter `VaultKey@2024` to unlock the vault and take a screenshot.
- [ ] Step 4: Vault Dashboard - Verify `/vault.html` and take a screenshot.
- [ ] Step 5: Add Entry - Add entry for "GitHub", use details, and take a screenshot.
- [ ] Step 6: View Entry Detail - Click GitHub entry, wait for risk audit, and take a screenshot.
- [ ] Step 7: Check Network Request - Verify `PUT /api/vault` JSON body.
- [ ] Step 8: Password Generator - Click the "🎲" button and take a screenshot.
- [ ] Step 9: Settings Modal - Click the "⚙️" button and take a screenshot.
- [ ] Step 10: Logout - Click "Sign Out" and take a final screenshot.

## Notes:
- Localhost URL: `https://localhost:5000`
- Account: `demo@zkvault.dev` / `Demo@Vault99!`
- Master Password: `VaultKey@2024`
- SSL Status: Encountering `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` for HTTPS.
- HTTP Status: Encountering `ERR_EMPTY_RESPONSE` for HTTP.
- Tried: localhost, 127.0.0.1, [::1].
- Result: Stuck on SSL handshake.
