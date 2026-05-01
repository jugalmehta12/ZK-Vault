/**
 * generator.js — Secure Password Generator
 */

window.PasswordGenerator = (() => {
  const CHARS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  };

  /**
   * Generate a cryptographically random password.
   * @param {Object} options
   * @param {number} options.length
   * @param {boolean} options.upper
   * @param {boolean} options.digits
   * @param {boolean} options.symbols
   * @returns {string}
   */
  function generate({ length = 16, upper = true, digits = true, symbols = true } = {}) {
    let charset = CHARS.lower;
    const required = [CHARS.lower[Math.floor(Math.random() * CHARS.lower.length)]];

    if (upper) { charset += CHARS.upper; required.push(CHARS.upper[getRandomInt(CHARS.upper.length)]); }
    if (digits) { charset += CHARS.digits; required.push(CHARS.digits[getRandomInt(CHARS.digits.length)]); }
    if (symbols) { charset += CHARS.symbols; required.push(CHARS.symbols[getRandomInt(CHARS.symbols.length)]); }

    const randomChars = [];
    for (let i = required.length; i < length; i++) {
      randomChars.push(charset[getRandomInt(charset.length)]);
    }

    // Shuffle required + random chars
    const all = [...required, ...randomChars];
    shuffleArray(all);
    return all.join('');
  }

  function getRandomInt(max) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = getRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function calcEntropy(password) {
    let charsetSize = 0;
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/[0-9]/.test(password)) charsetSize += 10;
    if (/[^A-Za-z0-9]/.test(password)) charsetSize += 32;
    return Math.round(Math.log2(Math.pow(charsetSize, password.length)));
  }

  return { generate, calcEntropy };
})();
