const http = require('http');
const fs = require('fs');

async function runTests() {
  const resultLog = [];
  const log = (msg, obj) => { resultLog.push({ msg, data: obj }); };
  
  let csrfCookie = '';
  let sessionCookie = '';
  const email = `test-${Date.now()}@zkvault.dev`;
  const password = 'Test@Password123!';

  const getCookies = (res) => {
    let rawCookies = res.headers.get('set-cookie');
    if (!rawCookies) return {};
    const parsed = {};
    const parts = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    parts.forEach(str => {
       const mainParts = str.split(', ');
       mainParts.forEach(c => {
           const [nameVal] = c.split(';');
           const [name, ...rest] = nameVal.split('=');
           if(name && rest.length) parsed[name.trim()] = rest.join('=');
       });
    });
    return parsed;
  };

  const getCookieHeader = () => {
     let header = [];
     if(csrfCookie) header.push('csrf-token=' + csrfCookie);
     if(sessionCookie) header.push('token=' + sessionCookie);
     return header.join('; ');
  };

  try {
    let res = await fetch('http://localhost:5000/api/vault');
    let cookies = getCookies(res);
    if(cookies['csrf-token']) csrfCookie = cookies['csrf-token'];
    log('CSRF Cookie obtained', csrfCookie);

    res = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': getCookieHeader(), 'x-csrf-token': csrfCookie },
      body: JSON.stringify({ email, password, confirmPassword: password })
    });
    const regData = await res.json();
    log('Register Response', regData);
    let authCookies = getCookies(res);
    if(authCookies['token']) sessionCookie = authCookies['token'];
    log('Session Cookie after register', sessionCookie);

    const vaultBlob = {
        encryptedVault: Buffer.from('fake_encrypted_data').toString('base64'),
        vaultIV: Buffer.from('fake_iv').toString('base64'),
        vaultSalt: Buffer.from('fake_salt').toString('base64'),
    };
    
    // Save Vault
    res = await fetch('http://localhost:5000/api/vault', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': getCookieHeader(), 'x-csrf-token': csrfCookie },
      body: JSON.stringify(vaultBlob)
    });
    const saveVaultData = await res.json();
    log('Save Vault Response', saveVaultData);

    // Get Vault
    res = await fetch('http://localhost:5000/api/vault', {
      method: 'GET',
      headers: { 'Cookie': getCookieHeader() }
    });
    const getVaultData = await res.json();
    log('Get Vault Response', getVaultData);
    
    if(getVaultData.data && getVaultData.data.encryptedVault === vaultBlob.encryptedVault) {
        log('Final', 'PASSED');
    } else {
        log('Final', 'FAILED');
    }

  } catch (error) {
    log('Error', error.stack || error.message);
  }
  
  fs.writeFileSync('test-results.json', JSON.stringify(resultLog, null, 2));
}

runTests();
