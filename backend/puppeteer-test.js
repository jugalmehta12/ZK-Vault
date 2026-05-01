const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const logs = [];
  
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => logs.push(`[ERROR] ${error.message}`));

  try {
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle0' });
    
    // Register
    await page.click('#tab-register');
    await page.type('#reg-email', `test-${Date.now()}@example.com`);
    await page.type('#reg-password', 'Strong!234');
    await page.type('#reg-confirm', 'Strong!234');
    await page.click('#reg-btn');
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Check if master screen is active
    const isMasterVisible = await page.$eval('#master-screen', el => el.classList.contains('active'));
    logs.push('[INFO] Master screen active: ' + isMasterVisible);
    
    // Unlock vault
    await page.type('#master-input', 'my-master-secret');
    await page.click('#master-btn');
    
    await new Promise(r => setTimeout(r, 2000));
    
    const url = page.url();
    logs.push('[INFO] Final URL: ' + url);
    
    // Take a screenshot just in case
    await page.screenshot({ path: 'puppeteer-screencap.png' });

  } catch (err) {
    logs.push('[FATAL] ' + err.message);
  } finally {
    fs.writeFileSync('puppet-logs.txt', logs.join('\n'));
    await browser.close();
  }
})();
