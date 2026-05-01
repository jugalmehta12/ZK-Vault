/**
 * vault.js — Vault Store + CRUD + Server Sync
 *
 * VaultStore holds the in-memory plaintext vault.
 * Before any save to server, it encrypts the vault with the derived key.
 */

window.VaultStore = (() => {
  let _entries = [];
  let _key = null;
  let _salt = null;
  let _rsaPrivateKey = null;

  function setKey(key) { _key = key; }
  function setSalt(salt) { _salt = salt; }
  function setEntries(entries) { _entries = entries; }
  function getEntries() { return [..._entries]; }
  
  function setRSAPrivateKey(rKey) { _rsaPrivateKey = rKey; }
  function getRSAPrivateKey() { return _rsaPrivateKey; }

  function clear() {
    _entries = [];
    _key = null;
    _salt = null;
    _rsaPrivateKey = null;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  function addEntry(entry) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    _entries.push({ ...entry, id, createdAt: now, updatedAt: now });
    // Persist session view immediately so UI updates and persists in-session
    try { sessionStorage.setItem('zk_vault', JSON.stringify(_entries)); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('zk:vault:changed')); } catch (e) { /* ignore */ }
    return id;
  }

  function updateEntry(id, updates) {
    const idx = _entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    _entries[idx] = { ..._entries[idx], ...updates, updatedAt: new Date().toISOString() };
    try { sessionStorage.setItem('zk_vault', JSON.stringify(_entries)); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('zk:vault:changed')); } catch (e) { /* ignore */ }
    return true;
  }

  function deleteEntry(id) {
    const before = _entries.length;
    _entries = _entries.filter((e) => e.id !== id);
    try { sessionStorage.setItem('zk_vault', JSON.stringify(_entries)); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('zk:vault:changed')); } catch (e) { /* ignore */ }
    return _entries.length < before;
  }

  function getEntry(id) {
    return _entries.find((e) => e.id === id) || null;
  }

  function search(query) {
    const q = query.toLowerCase();
    return _entries.filter(
      (e) =>
        e.title?.toLowerCase().includes(q) ||
        e.username?.toLowerCase().includes(q) ||
        e.url?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
    );
  }

  // ─── Encrypt & Save to Server ─────────────────────────────────────────────
  async function saveToServer() {
    if (!_key || !_salt) throw new Error('Vault not unlocked');
    
    // Inject the RSA private key into the stored entries blob
    const allEntries = [..._entries];
    if (_rsaPrivateKey) {
      const privB64 = await ZKCrypto.exportPrivateKey(_rsaPrivateKey);
      allEntries.push({ type: '_rsa_private_key_', value: privB64 });
    }
    
    const plaintext = JSON.stringify(allEntries);
    const { ciphertext, iv } = await ZKCrypto.encryptVault(_key, plaintext);

    const { ok, data } = await Auth.apiFetch('/api/vault', {
      method: 'PUT',
      body: JSON.stringify({
        encryptedVault: ciphertext,
        vaultIV: iv,
        vaultSalt: _salt,
      }),
    });

    if (!ok) throw new Error(data.message || 'Save failed');
    
    // Update offline cache (localStorage) and session storage
    localStorage.setItem('offline_vault', ciphertext);
    localStorage.setItem('offline_iv', iv);
    localStorage.setItem('offline_salt', _salt);
    
    // Also update sessionStorage to persist across page navigation
    sessionStorage.setItem('zk_vault', JSON.stringify(_entries));
    
    return true;
  }

  return {
    setKey, setSalt, setEntries, getEntries, clear,
    addEntry, updateEntry, deleteEntry, getEntry, search,
    saveToServer, setRSAPrivateKey, getRSAPrivateKey
  };
})();
