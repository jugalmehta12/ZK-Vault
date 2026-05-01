/**
 * crypto.js — Zero-Knowledge Cryptography Module
 * All encryption/decryption happens HERE, in the browser.
 * The server NEVER receives the master password or plaintext vault.
 *
 * Uses:
 *   • PBKDF2  (310,000 iterations, SHA-256) for key derivation
 *   • AES-GCM (256-bit) for symmetric encryption
 */

const PBKDF2_ITERATIONS = 310000;
const KEY_LENGTH = 256;

/**
 * Generate a cryptographically secure random salt (16 bytes).
 * @returns {Uint8Array}
 */
function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Convert Uint8Array → Base64 string (for storage / transmission).
 */
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Convert Base64 string → Uint8Array.
 */
function base64ToBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Derive an AES-GCM CryptoKey from the master password + salt using PBKDF2.
 * @param {string} masterPassword
 * @param {Uint8Array|string} salt  — Uint8Array or Base64 string
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(masterPassword, salt) {
  const enc = new TextEncoder();
  const saltBytes = typeof salt === 'string' ? base64ToBuffer(salt) : salt;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // not extractable — key material stays in browser memory
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext (string) vault data with AES-GCM.
 * @param {CryptoKey} key
 * @param {string} plaintext
 * @returns {Promise<{ ciphertext: string, iv: string }>}  — Both Base64
 */
async function encryptVault(key, plaintext) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    ciphertext: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypt AES-GCM ciphertext.
 * @param {CryptoKey} key
 * @param {string} ciphertext — Base64
 * @param {string} iv — Base64
 * @returns {Promise<string>} — plaintext
 */
async function decryptVault(key, ciphertext, iv) {
  const dec = new TextDecoder();
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(ciphertext)
  );
  return dec.decode(plainBuffer);
}

/**
 * Compute SHA-1 hash of a string (used for HIBP k-anonymity check).
 * @param {string} str
 * @returns {Promise<string>} — Uppercase hex string
 */
async function sha1Hex(str) {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-1', enc.encode(str));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

  // ============================================================================
  // ASYMMETRIC CRYPTOGRAPHY (RSA-OAEP) FOR SHARING
  // ============================================================================

  async function generateRSAKeyPair() {
    return await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
  }

  async function exportPublicKey(cryptoKey) {
    const exported = await crypto.subtle.exportKey('spki', cryptoKey);
    return bufferToBase64(exported);
  }

  async function exportPrivateKey(cryptoKey) {
    const exported = await crypto.subtle.exportKey('pkcs8', cryptoKey);
    return bufferToBase64(exported);
  }

  async function importPublicKey(base64Key) {
    const buffer = base64ToBuffer(base64Key);
    return await crypto.subtle.importKey(
      'spki',
      buffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );
  }

  async function importPrivateKey(base64Key) {
    const buffer = base64ToBuffer(base64Key);
    return await crypto.subtle.importKey(
      'pkcs8',
      buffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    );
  }

  async function encryptRSA(publicKey, plaintext) {
    const enc = new TextEncoder();
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      enc.encode(plaintext)
    );
    return bufferToBase64(encryptedBuffer);
  }

  async function decryptRSA(privateKey, base64Ciphertext) {
    const dec = new TextDecoder();
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      base64ToBuffer(base64Ciphertext)
    );
    return dec.decode(decryptedBuffer);
  }

  // Expose globally
   const ZKCrypto = {
    generateSalt,
    bufferToBase64,
    base64ToBuffer,
    deriveKey,
    encryptVault,
    decryptVault,
    sha1Hex,
    generateRSAKeyPair,
    exportPublicKey,
    exportPrivateKey,
    importPublicKey,
    importPrivateKey,
    encryptRSA,
    decryptRSA,
  };

   // Expose for browser runtime and CommonJS tests.
   if (typeof window !== 'undefined') {
     window.ZKCrypto = ZKCrypto;
   }

   if (typeof module !== 'undefined' && module.exports) {
     module.exports = ZKCrypto;
   }
