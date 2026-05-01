/**
 * risk.js — Client-Side Password Risk Intelligence Engine
 *
 * All analysis happens locally. No passwords ever leave the browser.
 *
 * Features:
 *  • Password strength scoring (entropy-based)
 *  • Breach check via HIBP k-anonymity API
 *  • Duplicate password detection
 *  • Old password detection (> 90 days)
 *  • Vault Security Score (0–100)
 */

window.RiskEngine = (() => {
  // ─── Strength Scoring ──────────────────────────────────────────────────────
  const COMMON_PASSWORDS = [
    'password', '123456', 'password1', 'qwerty', 'abc123', 'letmein',
    'monkey', 'master', 'dragon', 'pass', 'iloveyou', 'sunshine',
  ];

  function scorePassword(password) {
    if (!password) return { score: 0, label: 'None', color: '#444', entropy: 0 };

    // Check common
    if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
      return { score: 0, label: 'Very Weak', color: '#ff4444', entropy: 0 };
    }

    let entropy = 0;
    let charsetSize = 0;
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/[0-9]/.test(password)) charsetSize += 10;
    if (/[^A-Za-z0-9]/.test(password)) charsetSize += 32;
    entropy = Math.log2(Math.pow(charsetSize, password.length));

    // Penalize patterns
    if (/(.)\1{2,}/.test(password)) entropy *= 0.7;   // repeated chars
    if (/^[a-zA-Z]+$/.test(password)) entropy *= 0.85; // only letters
    if (/^[0-9]+$/.test(password)) entropy *= 0.6;    // only numbers

    let score, label, color;
    if (entropy < 28) { score = 1; label = 'Very Weak'; color = '#ff4444'; }
    else if (entropy < 40) { score = 2; label = 'Weak'; color = '#ff8c00'; }
    else if (entropy < 56) { score = 3; label = 'Fair'; color = '#ffd700'; }
    else if (entropy < 72) { score = 4; label = 'Strong'; color = '#7cfc00'; }
    else { score = 5; label = 'Very Strong'; color = '#00e5ff'; }

    return { score, label, color, entropy: Math.round(entropy) };
  }

  // ─── HIBP Breach Check (k-anonymity) ──────────────────────────────────────
  async function checkBreached(password) {
    try {
      const hash = await ZKCrypto.sha1Hex(password);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
      });

      if (!response.ok) return { breached: false, count: 0, error: 'HIBP unavailable' };

      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix.trim().toUpperCase() === suffix) {
          return { breached: true, count: parseInt(count.trim(), 10) };
        }
      }
      return { breached: false, count: 0 };
    } catch (err) {
      return { breached: false, count: 0, error: 'Network error' };
    }
  }

  // ─── Duplicate Detection ──────────────────────────────────────────────────
  function findDuplicates(entries) {
    const passwordMap = {};
    entries.forEach((e) => {
      if (!e.password) return;
      if (!passwordMap[e.password]) passwordMap[e.password] = [];
      passwordMap[e.password].push(e.id);
    });
    const duplicates = {};
    for (const [_pwd, ids] of Object.entries(passwordMap)) {
      if (ids.length > 1) ids.forEach((id) => (duplicates[id] = true));
    }
    return duplicates; // { entryId: true } for entries with duplicate passwords
  }

  // ─── Old Password Detection ────────────────────────────────────────────────
  function findOldPasswords(entries, maxAgeDays = 90) {
    const now = Date.now();
    const old = {};
    entries.forEach((e) => {
      if (!e.updatedAt) return;
      const ageDays = (now - new Date(e.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) old[e.id] = Math.round(ageDays);
    });
    return old;
  }

  // ─── Vault Security Score ─────────────────────────────────────────────────
  /**
   * @param {Array} entries — vault entries
   * @param {Object} breachResults — { entryId: { breached, count } }
   * @returns {{ score: number, grade: string, details: Object }}
   */
  function calculateVaultScore(entries, breachResults = {}) {
    if (!entries || entries.length === 0) return { score: 100, grade: 'A', details: {} };

    const duplicates = findDuplicates(entries);
    const oldPasswords = findOldPasswords(entries);
    let totalPenalty = 0;
    const details = { weak: 0, duplicates: 0, breached: 0, old: 0, total: entries.length };

    entries.forEach((e) => {
      const strength = scorePassword(e.password || '');
      if (strength.score <= 2) { totalPenalty += 20; details.weak++; }
      else if (strength.score === 3) { totalPenalty += 5; }

      if (duplicates[e.id]) { totalPenalty += 15; details.duplicates++; }
      if (breachResults[e.id]?.breached) { totalPenalty += 25; details.breached++; }
      if (oldPasswords[e.id]) { totalPenalty += 10; details.old++; }
    });

    const avgPenalty = totalPenalty / entries.length;
    const score = Math.max(0, Math.round(100 - avgPenalty));

    let grade;
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 45) grade = 'D';
    else grade = 'F';

    return { score, grade, details };
  }

  // ─── Full audit per entry ──────────────────────────────────────────────────
  async function auditEntry(entry, allEntries) {
    const strength = scorePassword(entry.password || '');
    const breachResult = entry.password ? await checkBreached(entry.password) : { breached: false };
    const duplicates = findDuplicates(allEntries);
    const oldPasswords = findOldPasswords(allEntries);

    return {
      strength,
      breached: breachResult.breached,
      breachCount: breachResult.count,
      isDuplicate: !!duplicates[entry.id],
      isOld: !!oldPasswords[entry.id],
      ageDays: oldPasswords[entry.id] || 0,
    };
  }

  return {
    scorePassword,
    checkBreached,
    findDuplicates,
    findOldPasswords,
    calculateVaultScore,
    auditEntry,
  };
})();
