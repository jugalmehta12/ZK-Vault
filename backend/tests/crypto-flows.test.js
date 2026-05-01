const { webcrypto } = require('node:crypto');

if (!global.crypto) {
  global.crypto = webcrypto;
}

if (!global.btoa) {
  global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}

if (!global.atob) {
  global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
}

const ZKCrypto = require('../../frontend/js/crypto');

describe('Client crypto flow automation', () => {
  test('derives key, encrypts, and decrypts vault payload', async () => {
    const salt = ZKCrypto.generateSalt();
    const key = await ZKCrypto.deriveKey('Master#Pass123', salt);

    const plaintext = JSON.stringify([
      { title: 'GitHub', username: 'alice', password: 'A!b2c3d4' },
      { title: 'Bank', username: 'alice.b', password: 'S3cure!Pass' },
    ]);

    const encrypted = await ZKCrypto.encryptVault(key, plaintext);
    const decrypted = await ZKCrypto.decryptVault(key, encrypted.ciphertext, encrypted.iv);

    expect(typeof encrypted.ciphertext).toBe('string');
    expect(typeof encrypted.iv).toBe('string');
    expect(decrypted).toBe(plaintext);
  });

  test('uses randomized IV so repeated encryption produces different ciphertext', async () => {
    const salt = ZKCrypto.generateSalt();
    const key = await ZKCrypto.deriveKey('Master#Pass123', salt);

    const payload = JSON.stringify({ title: 'Email', password: 'Un1que!Pass' });

    const first = await ZKCrypto.encryptVault(key, payload);
    const second = await ZKCrypto.encryptVault(key, payload);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test('generates stable SHA-1 hex output for breach checking flow', async () => {
    const hash = await ZKCrypto.sha1Hex('password');
    expect(hash).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });
});
