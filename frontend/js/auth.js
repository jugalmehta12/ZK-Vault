/**
 * auth.js — Authentication Module
 * Handles: Register, Login (with optional MFA), Master Password entry,
 * Key derivation, initial vault fetch and decryption.
 */

window.Auth = (() => {
  let _csrfToken = null;

  // Get CSRF token from cookie (double-submit pattern)
  function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    const match = document.cookie.match(/csrf-token=([^;]+)/);
    _csrfToken = match ? match[1] : '';
    return _csrfToken;
  }

  async function apiFetch(url, options = {}) {
    const defaults = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
        ...options.headers,
      },
    };
    try {
      const res = await fetch(url, { ...defaults, ...options });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch')) {
        throw new Error('Network Error');
      }
      throw err;
    }
  }

  async function register(email, password) {
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async function login(email, password, mfaToken = '') {
    const body = { email, password };
    if (mfaToken) body.mfaToken = mfaToken;
    return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    // Clear all local state
    VaultStore.clear();
    sessionStorage.clear();
    window.location.href = '/';
  }

  async function getMe() {
    return apiFetch('/api/auth/me');
  }

  async function setupMFA() {
    return apiFetch('/api/auth/mfa/setup', { method: 'POST' });
  }

  async function verifyMFA(token) {
    return apiFetch('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ token }) });
  }

  async function disableMFA() {
    return apiFetch('/api/auth/mfa/disable', { method: 'POST' });
  }

  async function getSessions() {
    return apiFetch('/api/auth/sessions');
  }

  async function revokeSession(sessionId) {
    return apiFetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  }

  async function revokeOtherSessions() {
    return apiFetch('/api/auth/sessions', { method: 'DELETE' });
  }

  async function getAuditLogs() {
    return apiFetch('/api/auth/audit-logs');
  }

  async function getVaultVersions() {
    return apiFetch('/api/vault/versions');
  }

  async function rollbackVault(versionId) {
    return apiFetch('/api/vault/rollback', {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    });
  }

  async function configureRecovery(payload) {
    return apiFetch('/api/auth/recovery/configure', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function getRecoveryStatus() {
    return apiFetch('/api/auth/recovery/status');
  }

  /**
   * Called after login succeeds. Prompts for master password,
   * derives key locally, fetches + decrypts vault.
   * @param {string} masterPassword
   * @returns {boolean} success
   */
  async function unlockVault(masterPassword) {
    try {
      let salt;
      let entries = [];
      let encryptedVault, vaultIV, vaultSalt;

      // 1. Fetch encrypted vault from server or fallback to local cache
      try {
        const { ok, data } = await apiFetch('/api/vault');
        if (!ok) throw new Error('Failed to fetch vault');
        
        vaultSalt = data.vault?.vaultSalt;
        encryptedVault = data.vault?.encryptedVault;
        vaultIV = data.vault?.vaultIV;
        
        if (encryptedVault) {
          localStorage.setItem('offline_vault', encryptedVault);
          localStorage.setItem('offline_iv', vaultIV);
          localStorage.setItem('offline_salt', vaultSalt);
        }
      } catch (e) {
        if (e.message === 'Network Error') {
          encryptedVault = localStorage.getItem('offline_vault');
          vaultIV = localStorage.getItem('offline_iv');
          vaultSalt = localStorage.getItem('offline_salt');
          if (!encryptedVault) throw new Error('No offline vault cache available');
        } else {
          throw e;
        }
      }

      if (!encryptedVault) {
        // First time — generate salt, derive key, start with empty vault
        salt = ZKCrypto.generateSalt();
        VaultStore.setSalt(ZKCrypto.bufferToBase64(salt));

        // BUG-06 FIX: Derive key in the new-vault branch so the key is always set
        const newKey = await ZKCrypto.deriveKey(masterPassword, salt);
        VaultStore.setKey(newKey);
      } else {
        // Existing vault
        salt = vaultSalt;
        VaultStore.setSalt(vaultSalt);

        // BUG-05 FIX: Derive key only once (was called twice — expensive at 310k PBKDF2 iterations)
        const key = await ZKCrypto.deriveKey(masterPassword, salt);
        VaultStore.setKey(key);

        // 3. Decrypt locally
        const plaintext = await ZKCrypto.decryptVault(key, encryptedVault, vaultIV);
        entries = JSON.parse(plaintext);
      }

      // Key is already set in VaultStore from the branch above — no second deriveKey call needed
      
      // -- RSA KEYPAIR INIT --
      const rsaPrivBlob = entries.find(e => e.type === '_rsa_private_key_');
      entries = entries.filter(e => e.type !== '_rsa_private_key_');

      if (rsaPrivBlob) {
        const rsaKey = await ZKCrypto.importPrivateKey(rsaPrivBlob.value);
        VaultStore.setRSAPrivateKey(rsaKey);
      } else {
        const keyPair = await ZKCrypto.generateRSAKeyPair();
        VaultStore.setRSAPrivateKey(keyPair.privateKey);
        
        const pubBase64 = await ZKCrypto.exportPublicKey(keyPair.publicKey);
        await apiFetch('/api/shares/public-key', {
          method: 'POST',
          body: JSON.stringify({ publicKey: pubBase64 })
        });
      }

      VaultStore.setEntries(entries);
      
      if (!rsaPrivBlob) {
        await VaultStore.saveToServer();
      }
      
      // SEC-03 FIX: Do NOT persist the master password to sessionStorage — it must stay in memory only.
      // On navigation to vault.html, the salt is available from sessionStorage to re-derive the key
      // when the user re-enters the master password (or the key is kept in VaultStore memory).
      sessionStorage.setItem('zk_salt', typeof salt === 'string' ? salt : ZKCrypto.bufferToBase64(salt));
      sessionStorage.setItem('zk_vault', JSON.stringify(entries));
      
      return true;
    } catch (err) {
      console.error('Vault unlock failed:', err);
      return false;
    }
  }

  return {
    getCsrfToken,
    apiFetch,
    register,
    login,
    logout,
    getMe,
    setupMFA,
    verifyMFA,
    disableMFA,
    getSessions,
    revokeSession,
    revokeOtherSessions,
    getAuditLogs,
    getVaultVersions,
    rollbackVault,
    configureRecovery,
    getRecoveryStatus,
    unlockVault,
  };
})();
