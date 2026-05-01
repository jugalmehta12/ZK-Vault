/**
 * app.js — Main Application Orchestrator (for vault.html)
 * Wires together: VaultStore, Auth, RiskEngine, PasswordGenerator, UI
 */

document.addEventListener('DOMContentLoaded', async () => {
  const THEME_KEY = 'zk_theme';

  function applyTheme(theme) {
    const body = document.body;
    body.dataset.theme = theme;
    body.classList.toggle('theme-light', theme === 'light');
    body.classList.toggle('theme-dark', theme === 'dark');
    const button = document.getElementById('theme-toggle-btn');
    if (button) button.textContent = theme === 'light' ? '🌙' : '☀️';
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = document.body.dataset.theme || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved || 'light');
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
  }

  initTheme();

  // ── Check session ──────────────────────────────────────────────────────────
  const { ok, data } = await Auth.getMe().catch(() => ({ ok: false }));
  if (!ok) {
    window.location.href = '/';
    return;
  }
  window._currentUser = data.user;
  document.getElementById('user-email').textContent = data.user.email;

  // ── Restore vault state from sessionStorage ────────────────────────────────
  // SEC-03: zk_master is no longer stored in sessionStorage.
  // The CryptoKey lives in VaultStore memory. On the same-session navigation
  // from index.html → vault.html the key is already set.
  // On a fresh page load (refresh / direct URL), only the salt + encrypted
  // vault entries are available — the user must re-enter master password.
  const storedSalt = sessionStorage.getItem('zk_salt');
  const storedVault = sessionStorage.getItem('zk_vault');
  const hasKeyInMemory = !!VaultStore.getKey?.();

  // If the key is already in memory (same JS session), restore entries from
  // sessionStorage cache and continue without any unlock prompt.
  if (hasKeyInMemory && storedVault) {
    try {
      VaultStore.setEntries(JSON.parse(storedVault));
    } catch (err) {
      console.error('Failed to restore cached vault entries:', err);
    }
  }

  // If we have NO key in memory but have a salt, we need the master password
  // to re-derive the key. Show the unlock modal.
  if (!hasKeyInMemory) {
    // show unlock modal
    toggleModal('unlock-modal', true);
    document.getElementById('unlock-master-input')?.focus();

    const unlockHandler = async () => {
      const pw = document.getElementById('unlock-master-input').value;
      const errEl = document.getElementById('unlock-error');
      const btn = document.getElementById('unlock-master-submit');
      errEl.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Unlocking…';
      try {
        const ok = await Auth.unlockVault(pw);
        btn.disabled = false; btn.textContent = 'Unlock';
        if (ok) {
          toggleModal('unlock-modal', false);
          // refresh UI now that VaultStore has been populated
          try { refreshList(); } catch (e) { console.error('refreshList after unlock failed', e); }
          try { refreshRecoveryStatus(); } catch (e) { /* ignore */ }
          try { refreshDashboardContext(); } catch (e) { /* ignore */ }
        } else {
          errEl.textContent = 'Wrong master password or vault corrupted.';
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.textContent = 'Unlock failed: ' + e.message;
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Unlock';
      }
    };

    document.getElementById('unlock-master-submit')?.addEventListener('click', unlockHandler);
    document.getElementById('unlock-master-input')?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') unlockHandler(); });
    document.getElementById('unlock-modal-close')?.addEventListener('click', () => toggleModal('unlock-modal', false));
    document.getElementById('unlock-master-cancel')?.addEventListener('click', () => toggleModal('unlock-modal', false));
  }

  // ── Render entries ─────────────────────────────────────────────────────────
  let selectedId = null;
  let currentMenuFilter = 'all';
  let lastSearchKeyword = '';
  let tipIndex = 0;
  let tipTimer = null;
  const dashboardState = {
    recoveryEnabled: false,
    activeSessions: 1,
    timeline: [],
  };
  const auditCache = {};

  function formatDateTime(value) {
    if (!value) return 'Unknown time';
    return new Date(value).toLocaleString();
  }

  function getLatestEntries(entries, count = 5) {
    return [...entries]
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, count);
  }

  function renderAtGlanceCards(entries) {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const oldMap = RiskEngine.findOldPasswords(entries);
    const weakCount = entries.filter((e) => {
      const score = auditCache[e.id]?.strength?.score ?? RiskEngine.scorePassword(e.password || '').score;
      return score <= 2;
    }).length;

    const addedWeek = entries.filter((e) => {
      const t = new Date(e.createdAt || e.updatedAt || 0).getTime();
      return t && (now - t <= weekMs);
    }).length;

    const needUpdate = new Set([...Object.keys(oldMap), ...entries.filter((e) => {
      const score = auditCache[e.id]?.strength?.score ?? RiskEngine.scorePassword(e.password || '').score;
      return score <= 2;
    }).map((e) => e.id)]).size;

    const missingUrl = entries.filter((e) => !String(e.url || '').trim()).length;
    const backupAt = localStorage.getItem('zk_last_backup_at');

    const addedEl = document.getElementById('glance-added-week');
    const updateEl = document.getElementById('glance-needs-update');
    const urlEl = document.getElementById('glance-no-url');
    const backupEl = document.getElementById('glance-last-backup');

    if (addedEl) addedEl.textContent = String(addedWeek);
    if (updateEl) updateEl.textContent = String(needUpdate || weakCount);
    if (urlEl) urlEl.textContent = String(missingUrl);
    if (backupEl) backupEl.textContent = backupAt ? new Date(backupAt).toLocaleDateString() : 'Never';
  }

  function getCategoryStats(entries) {
    const map = {};
    entries.forEach((e) => {
      const key = e.category || 'Other';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function getDynamicTips(entries) {
    const duplicatesMap = RiskEngine.findDuplicates(entries);
    const reused = Math.floor(Object.keys(duplicatesMap).length / 2);
    return [
      reused > 0 ? `Reuse detected in ${reused} entr${reused === 1 ? 'y' : 'ies'}` : 'No password reuse detected. Keep it unique.',
      'Rotate passwords older than 90 days',
      'Enable MFA for stronger account protection',
      'Use generated passwords for critical accounts',
    ];
  }

  function renderRecentEntriesWidget(entries) {
    const wrap = document.getElementById('recent-list');
    if (!wrap) return;

    const latest = getLatestEntries(entries, 5);
    if (!latest.length) {
      wrap.innerHTML = '<div class="insight-muted">No entries yet. Create your first one.</div>';
      return;
    }

    wrap.innerHTML = '';
    latest.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-recent-item';
      btn.innerHTML = `
        <span>${escHtml(entry.title || 'Untitled')}</span>
        <span class="dashboard-recent-meta">${formatDateTime(entry.updatedAt)}</span>
      `;
      btn.addEventListener('click', () => selectEntry(entry.id));
      wrap.appendChild(btn);
    });
  }

  function renderTipWidget(entries) {
    const tipEl = document.getElementById('security-tip-text');
    if (!tipEl) return;

    const tips = getDynamicTips(entries);
    if (!tips.length) {
      tipEl.textContent = 'No tips right now.';
      return;
    }

    tipIndex = tipIndex % tips.length;
    tipEl.textContent = tips[tipIndex];

    if (!tipTimer) {
      tipTimer = setInterval(() => {
        const allTips = getDynamicTips(VaultStore.getEntries());
        if (!allTips.length) return;
        tipIndex = (tipIndex + 1) % allTips.length;
        const node = document.getElementById('security-tip-text');
        if (node) node.textContent = allTips[tipIndex];
      }, 7000);
    }
  }

  function renderChecklistWidget() {
    const wrap = document.getElementById('actions-checklist');
    if (!wrap) return;

    const breachedCount = Object.values(auditCache).filter((a) => !!a?.breached).length;
    const items = [
      { label: 'Configure recovery phrase', done: dashboardState.recoveryEnabled },
      { label: 'Export encrypted backup', done: !!localStorage.getItem('zk_last_backup_at') },
      { label: 'Resolve breached passwords', done: breachedCount === 0 },
      { label: 'Revoke old sessions', done: dashboardState.activeSessions <= 1 },
    ];

    wrap.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = `check-item${item.done ? ' done' : ''}`;
      row.innerHTML = `<span>${escHtml(item.label)}</span><span class="status">${item.done ? 'Done' : 'Pending'}</span>`;
      wrap.appendChild(row);
    });
  }

  function renderInsightsWidget(entries) {
    const wrap = document.getElementById('insights-wrap');
    const hiddenMsg = document.getElementById('insights-search-active');
    const q = document.getElementById('search-input')?.value?.trim() || '';

    if (!wrap || !hiddenMsg) return;

    if (q) {
      wrap.classList.add('is-hidden');
      hiddenMsg.classList.remove('is-hidden');
      return;
    }

    wrap.classList.remove('is-hidden');
    hiddenMsg.classList.add('is-hidden');

    const stats = getCategoryStats(entries);
    const most = stats[0]?.[0] || '—';
    const total = entries.length || 1;
    document.getElementById('insight-most-category').textContent = most;
    document.getElementById('insight-last-search').textContent = lastSearchKeyword || 'None';

    const bars = document.getElementById('insight-category-bars');
    if (!bars) return;
    bars.innerHTML = '';

    stats.slice(0, 4).forEach(([name, count]) => {
      const percent = Math.round((count / total) * 100);
      const row = document.createElement('div');
      row.className = 'insight-bar-row';
      row.innerHTML = `
        <span>${escHtml(name)}</span>
        <span class="insight-bar-track"><span class="insight-bar-fill" style="width:${percent}%"></span></span>
        <strong>${percent}%</strong>
      `;
      bars.appendChild(row);
    });
  }

  function renderTimelineWidget() {
    const wrap = document.getElementById('activity-timeline');
    if (!wrap) return;

    const items = dashboardState.timeline.length
      ? dashboardState.timeline.slice(0, 5)
      : [
        { title: 'Login from current device', at: new Date().toISOString(), meta: 'Session started' },
        { title: 'Vault updated', at: null, meta: 'No updates yet' },
        { title: 'Entry shared', at: null, meta: 'No shares yet' },
        { title: 'Session revoked', at: null, meta: 'No revocations yet' },
      ];

    wrap.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.innerHTML = `
        <div class="timeline-title">${escHtml(item.title)}</div>
        <div class="timeline-meta">${escHtml(item.meta || '')} • ${formatDateTime(item.at)}</div>
      `;
      wrap.appendChild(row);
    });
  }

  function addTimelineEvent(title, meta) {
    dashboardState.timeline.unshift({
      title,
      at: new Date().toISOString(),
      meta,
    });
    dashboardState.timeline = dashboardState.timeline.slice(0, 12);
    renderTimelineWidget();
  }

  function renderDashboardWidgets() {
    const entries = VaultStore.getEntries();
    renderAtGlanceCards(entries);
    renderRecentEntriesWidget(entries);
    renderTipWidget(entries);
    renderChecklistWidget();
    renderInsightsWidget(entries);
    renderTimelineWidget();
  }

  async function refreshDashboardContext() {
    const [recoveryRes, sessionsRes, logsRes] = await Promise.all([
      Auth.getRecoveryStatus().catch(() => ({ ok: false })),
      Auth.getSessions().catch(() => ({ ok: false })),
      Auth.getAuditLogs().catch(() => ({ ok: false })),
    ]);

    if (recoveryRes.ok) dashboardState.recoveryEnabled = !!recoveryRes.data?.enabled;
    if (sessionsRes.ok) dashboardState.activeSessions = (sessionsRes.data?.sessions || []).length || 1;

    if (logsRes.ok && Array.isArray(logsRes.data?.logs)) {
      dashboardState.timeline = logsRes.data.logs.map((log) => ({
        title: String(log.event || 'Activity'),
        at: log.createdAt,
        meta: log.ip || 'Unknown IP',
      }));
    }

    renderDashboardWidgets();
  }

  function getMenuFilteredEntries(entries) {
    if (currentMenuFilter === 'recent') {
      const now = Date.now();
      return entries.filter((e) => {
        const updatedAt = e.updatedAt ? new Date(e.updatedAt).getTime() : 0;
        return updatedAt && (now - updatedAt) <= (7 * 24 * 60 * 60 * 1000);
      });
    }
    if (currentMenuFilter === 'breached') {
      return entries.filter((e) => !!auditCache[e.id]?.breached);
    }
    if (currentMenuFilter === 'weak') {
      return entries.filter((e) => {
        const score = auditCache[e.id]?.strength?.score ?? RiskEngine.scorePassword(e.password || '').score;
        return score <= 2;
      });
    }
    return entries;
  }

  function applyCurrentListView() {
    const q = document.getElementById('search-input')?.value?.trim() || '';
    const base = q ? VaultStore.search(q) : VaultStore.getEntries();
    renderEntries(getMenuFilteredEntries(base));
  }

  function renderEntries(entries) {
    const list = document.getElementById('entry-list');
    list.innerHTML = '';
    if (entries.length === 0) {
      list.innerHTML = '<li class="entry-empty">No entries yet. Click + to add one.</li>';
      return;
    }
    entries.forEach((e) => {
      const li = document.createElement('li');
      li.className = 'entry-item' + (e.id === selectedId ? ' active' : '');
      li.dataset.id = e.id;
      // Tooltip shown in collapsed sidebar mode (icon-only view)
      const tooltipSub = e.username || e.url || e.category || '';
      li.dataset.tooltip = tooltipSub
        ? `${e.title || 'Untitled'}\n${tooltipSub}`
        : (e.title || 'Untitled');
      const audit = auditCache[e.id] || {};
      let badges = '';
      if (audit.breached) badges += '<span class="badge badge-danger">Breached</span>';
      if (audit.isDuplicate) badges += '<span class="badge badge-warn">Duplicate</span>';
      if (audit.isOld) badges += '<span class="badge badge-warn">Old</span>';
      if (audit.strength && audit.strength.score <= 2) badges += '<span class="badge badge-warn">Weak</span>';

      li.innerHTML = `
        <div class="entry-icon">${getCategoryIcon(e.category)}</div>
        <div class="entry-info">
          <div class="entry-title">${escHtml(e.title || 'Untitled')}</div>
          <div class="entry-sub">${escHtml(e.username || e.url || '')}</div>
          ${badges ? `<div class="entry-badges">${badges}</div>` : ''}
        </div>`;
      li.addEventListener('click', () => selectEntry(e.id));
      list.appendChild(li);
    });
  }

  function renderDetail(entry) {
    document.getElementById('detail-panel').style.display = 'flex';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('share-entry-btn').style.display = 'inline-flex';
    document.getElementById('detail-title').textContent = entry.title || 'Untitled';
    document.getElementById('detail-username').value = entry.username || '';
    document.getElementById('detail-password').value = entry.password || '';
    document.getElementById('detail-url').value = entry.url || '';
    document.getElementById('detail-notes').value = entry.notes || '';
    document.getElementById('detail-category').value = entry.category || 'Login';
    document.getElementById('detail-updated').textContent = entry.updatedAt
      ? new Date(entry.updatedAt).toLocaleDateString()
      : '-';

    // Show audit
    const audit = auditCache[entry.id];
    const auditDiv = document.getElementById('detail-audit');
    if (audit) {
      const strength = audit.strength;
      auditDiv.innerHTML = `
        <div class="audit-row">
          <span class="audit-label">Strength</span>
          <span class="audit-value" style="color:${strength.color}">${strength.label} (${strength.entropy} bits)</span>
        </div>
        <div class="audit-row">
          <span class="audit-label">Breached</span>
          <span class="audit-value ${audit.breached ? 'text-danger' : 'text-success'}">
            ${audit.breached ? `⚠ Found in ${audit.breachCount.toLocaleString()} breaches` : '✓ Not found in known breaches'}
          </span>
        </div>
        <div class="audit-row">
          <span class="audit-label">Duplicate</span>
          <span class="audit-value ${audit.isDuplicate ? 'text-danger' : 'text-success'}">
            ${audit.isDuplicate ? '⚠ Used in multiple entries' : '✓ Unique'}
          </span>
        </div>
        <div class="audit-row">
          <span class="audit-label">Age</span>
          <span class="audit-value ${audit.isOld ? 'text-warn' : 'text-success'}">
            ${audit.isOld ? `⚠ ${audit.ageDays} days old — consider rotating` : '✓ Recently updated'}
          </span>
        </div>`;
    }

    // Strength meter
    const pct = audit ? ((audit.strength.score / 5) * 100) : 0;
    const color = audit?.strength?.color || '#444';
    document.getElementById('strength-bar').style.width = pct + '%';
    document.getElementById('strength-bar').style.background = color;
    document.getElementById('strength-label').textContent = audit?.strength?.label || '';
    document.getElementById('strength-label').style.color = color;
  }

  async function selectEntry(id) {
    selectedId = id;
    const entry = VaultStore.getEntry(id);
    if (!entry) return;

    document.querySelectorAll('.entry-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    renderDetail(entry);
    refreshVaultScore();

    // Background audit
    if (!auditCache[id]) {
      auditCache[id] = await RiskEngine.auditEntry(entry, VaultStore.getEntries());
      renderDetail(entry);
      refreshVaultScore();
    }
  }

  // ── Vault Score ────────────────────────────────────────────────────────────
  function refreshVaultScore() {
    const entries = VaultStore.getEntries();
    const breachResults = {};
    // Keep the score card tied to the currently opened entry so stale cached
    // breach checks from previously opened entries do not leak into the view.
    if (selectedId && auditCache[selectedId]) {
      breachResults[selectedId] = { breached: !!auditCache[selectedId].breached };
    }
    const { score, grade, details } = RiskEngine.calculateVaultScore(entries, breachResults);

    document.getElementById('vault-score').textContent = score;
    document.getElementById('vault-grade').textContent = grade;
    const scoreEl = document.getElementById('vault-score-wrap');
    scoreEl.className = 'score-wrap ' + (score >= 75 ? 'score-good' : score >= 50 ? 'score-fair' : 'score-poor');

    document.getElementById('score-weak').textContent = details.weak;
    document.getElementById('score-dupes').textContent = Math.floor(details.duplicates / 2);
    document.getElementById('score-breached').textContent = details.breached;
    document.getElementById('score-old').textContent = details.old;
    document.getElementById('score-total').textContent = details.total;

    const subtitle = document.getElementById('score-subtitle');
    if (subtitle) {
      subtitle.textContent = selectedId
        ? 'Vault Security Score (Selected Entry Impact)'
        : 'Vault Security Score (Baseline)';
    }
  }

  // ── Save with encryption ───────────────────────────────────────────────────
  async function saveAndSync() {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await VaultStore.saveToServer();
      addTimelineEvent('Vault updated', 'Encrypted changes saved');
      showToast('Vault saved securely ✓', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Save';
  }

  // ── Save detail form ───────────────────────────────────────────────────────
  document.getElementById('detail-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    const updates = {
      title: document.getElementById('detail-title-input').value,
      username: document.getElementById('detail-username').value,
      password: document.getElementById('detail-password').value,
      url: document.getElementById('detail-url').value,
      notes: document.getElementById('detail-notes').value,
      category: document.getElementById('detail-category').value,
    };
    VaultStore.updateEntry(selectedId, updates);
    delete auditCache[selectedId];
    await saveAndSync();
    refreshList();
    selectEntry(selectedId);
  });

  // ── Search ────────────────────────────────────────────────────────────────
  document.getElementById('search-input')?.addEventListener('input', () => {
    const q = document.getElementById('search-input')?.value?.trim() || '';
    if (q) lastSearchKeyword = q;
    applyCurrentListView();
    renderInsightsWidget(VaultStore.getEntries());
  });

  document.querySelectorAll('#sidebar-menu .menu-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMenuFilter = btn.dataset.filter || 'all';
      document.querySelectorAll('#sidebar-menu .menu-chip').forEach((chip) => {
        chip.classList.toggle('active', chip === btn);
      });
      applyCurrentListView();
    });
  });

  document.getElementById('quick-add-entry')?.addEventListener('click', () => {
    document.getElementById('add-btn')?.click();
  });

  document.getElementById('quick-open-generator')?.addEventListener('click', () => {
    document.getElementById('gen-btn')?.click();
  });

  document.getElementById('quick-health-check')?.addEventListener('click', () => {
    document.getElementById('health-btn')?.click();
  });

  document.getElementById('quick-recent-activity')?.addEventListener('click', () => {
    toggleModal('settings-modal', true);
    document.getElementById('load-audit-btn')?.click();
  });

  // ── Sidebar Toggle ────────────────────────────────────────────────────────
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    const layout = document.querySelector('.vault-layout');
    layout.classList.toggle('sidebar-collapsed');
    const isCollapsed = layout.classList.contains('sidebar-collapsed');
    localStorage.setItem('zk_sidebar_collapsed', isCollapsed ? 'true' : 'false');
  });

  // Restore sidebar state on load
  if (localStorage.getItem('zk_sidebar_collapsed') === 'true') {
    document.querySelector('.vault-layout').classList.add('sidebar-collapsed');
  }

  function closeDetailPanel() {
    selectedId = null;
    document.querySelectorAll('.entry-item').forEach((el) => el.classList.remove('active'));
    document.getElementById('detail-panel').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    refreshVaultScore();
    renderDashboardWidgets();
  }

  document.getElementById('detail-close-btn')?.addEventListener('click', closeDetailPanel);

  // ── Add Entry Modal ───────────────────────────────────────────────────────
  document.getElementById('add-btn')?.addEventListener('click', () => toggleModal('add-modal', true));
  document.getElementById('add-modal-close')?.addEventListener('click', () => toggleModal('add-modal', false));
  document.getElementById('add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('add-title').value;
    const username = document.getElementById('add-username').value;
    const password = document.getElementById('add-password').value;
    const url = document.getElementById('add-url').value;
    const notes = document.getElementById('add-notes').value;
    const category = document.getElementById('add-category').value;
    VaultStore.addEntry({ title, username, password, url, notes, category });
    await saveAndSync();
    refreshList();
    toggleModal('add-modal', false);
    document.getElementById('add-form').reset();
  });

  // ── Delete Entry ──────────────────────────────────────────────────────────
  document.getElementById('delete-btn')?.addEventListener('click', async () => {
    if (!selectedId) return;
    if (!confirm('Delete this entry permanently?')) return;
    VaultStore.deleteEntry(selectedId);
    delete auditCache[selectedId];
    closeDetailPanel();
    await saveAndSync();
    refreshList();
    refreshVaultScore();
  });

  // ── Password Generator Modal ───────────────────────────────────────────────
  document.getElementById('gen-btn')?.addEventListener('click', () => {
    toggleModal('gen-modal', true);
    generatePassword();
  });
  document.getElementById('gen-modal-close')?.addEventListener('click', () => toggleModal('gen-modal', false));
  document.getElementById('gen-length')?.addEventListener('input', (e) => {
    document.getElementById('gen-length-val').textContent = e.target.value;
    generatePassword();
  });
  ['gen-upper', 'gen-digits', 'gen-symbols'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', generatePassword);
  });
  document.getElementById('gen-refresh')?.addEventListener('click', generatePassword);
  document.getElementById('gen-copy')?.addEventListener('click', () => {
    const pw = document.getElementById('gen-output').value;
    navigator.clipboard.writeText(pw);
    showToast('Copied to clipboard!', 'success');
  });
  document.getElementById('gen-use')?.addEventListener('click', () => {
    const pw = document.getElementById('gen-output').value;
    const pwField = document.getElementById(selectedId ? 'detail-password' : 'add-password');
    if (pwField) pwField.value = pw;
    toggleModal('gen-modal', false);
  });

  function generatePassword() {
    const length = parseInt(document.getElementById('gen-length')?.value || 16);
    const upper = document.getElementById('gen-upper')?.checked ?? true;
    const digits = document.getElementById('gen-digits')?.checked ?? true;
    const symbols = document.getElementById('gen-symbols')?.checked ?? true;
    const pw = PasswordGenerator.generate({ length, upper, digits, symbols });
    document.getElementById('gen-output').value = pw;
    const entropy = PasswordGenerator.calcEntropy(pw);
    document.getElementById('gen-entropy').textContent = `${entropy} bits entropy`;
    const s = RiskEngine.scorePassword(pw);
    document.getElementById('gen-strength').textContent = s.label;
    document.getElementById('gen-strength').style.color = s.color;
  }

  // ── Password Visibility Toggle ─────────────────────────────────────────────
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        target.type = target.type === 'password' ? 'text' : 'password';
        btn.textContent = target.type === 'password' ? '👁' : '🙈';
      }
    });
  });

  // ── Copy to Clipboard ──────────────────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        navigator.clipboard.writeText(target.value);
        showToast('Copied!', 'success');
      }
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());

  // ── MFA Settings Modal ────────────────────────────────────────────────────
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    toggleModal('settings-modal', true);
    refreshRecoveryStatus();
  });
  document.getElementById('settings-modal-close')?.addEventListener('click', () => toggleModal('settings-modal', false));
  document.getElementById('mfa-setup-btn')?.addEventListener('click', async () => {
    if (window._currentUser?.mfaEnabled) {
      showToast('MFA is already setup.', 'info');
      return;
    }
    const { ok, data } = await Auth.setupMFA();
    if (ok) {
      document.getElementById('mfa-qr').src = data.qrCode;
      document.getElementById('mfa-qr-wrap').style.display = 'block';
      document.getElementById('mfa-secret-text').textContent = data.secret;
    } else {
      showToast(data?.message || 'Failed to setup MFA', 'error');
    }
  });
  document.getElementById('mfa-verify-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('mfa-token-input').value;
    const { ok } = await Auth.verifyMFA(token);
    if (ok) { showToast('MFA enabled!', 'success'); toggleModal('settings-modal', false); }
    else showToast('Invalid MFA token', 'error');
  });
  document.getElementById('mfa-disable-btn')?.addEventListener('click', async () => {
    if (!confirm('Disable MFA?')) return;
    await Auth.disableMFA();
    showToast('MFA disabled', 'success');
  });

  // ── Security Panels (Versions/Sessions/Audit/Recovery) ──────────────────
  document.getElementById('load-versions-btn')?.addEventListener('click', async () => {
    const wrap = document.getElementById('version-list');
    wrap.innerHTML = 'Loading history...';
    const { ok, data } = await Auth.getVaultVersions();
    if (!ok) {
      wrap.innerHTML = 'Failed to load versions.';
      return;
    }
    if (!data.versions?.length) {
      wrap.innerHTML = 'No snapshots yet.';
      return;
    }

    wrap.innerHTML = '';
    data.versions.forEach((v) => {
      const div = document.createElement('div');
      div.className = 'detail-card';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div>
            <div style="font-weight:700">Version ${v.version}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary)">${new Date(v.createdAt).toLocaleString()} • ${escHtml(v.reason)}</div>
          </div>
          <button class="btn btn-danger btn-rollback" data-id="${v.id}">Rollback</button>
        </div>`;
      wrap.appendChild(div);
    });

    wrap.querySelectorAll('.btn-rollback').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Rollback vault to this version? Current state will be snapshotted first.')) return;
        const { ok: rollbackOk, data: rollbackData } = await Auth.rollbackVault(btn.dataset.id);
        if (!rollbackOk) {
          showToast(rollbackData?.message || 'Rollback failed', 'error');
          return;
        }
        // SEC-03: zk_master no longer in sessionStorage — prompt user to unlock with master password
        toggleModal('unlock-modal', true);
        document.getElementById('unlock-master-input')?.focus();
        refreshList();
        showToast('Vault rolled back. Re-enter master password if prompted.', 'success');
      });
    });
  });

  document.getElementById('load-sessions-btn')?.addEventListener('click', async () => {
    const wrap = document.getElementById('session-list');
    wrap.innerHTML = 'Loading sessions...';
    const { ok, data } = await Auth.getSessions();
    if (!ok) {
      wrap.innerHTML = 'Failed to load sessions.';
      return;
    }

    wrap.innerHTML = '';
    (data.sessions || []).forEach((s) => {
      const isCurrent = s.id === data.currentSessionId;
      const div = document.createElement('div');
      div.className = 'detail-card';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <div style="font-weight:700">${isCurrent ? 'Current Device' : 'Device Session'}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary)">${escHtml(s.ip || 'Unknown IP')} • ${escHtml((s.userAgent || 'Unknown agent').slice(0, 80))}</div>
            <div style="font-size:0.72rem;color:var(--text-secondary)">Last seen: ${new Date(s.lastSeenAt).toLocaleString()}</div>
          </div>
          ${isCurrent ? '' : `<button class="btn btn-danger btn-revoke-session" data-id="${s.id}">Revoke</button>`}
        </div>`;
      wrap.appendChild(div);
    });

    wrap.querySelectorAll('.btn-revoke-session').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { ok: revokeOk } = await Auth.revokeSession(btn.dataset.id);
        if (!revokeOk) {
          showToast('Failed to revoke session', 'error');
          return;
        }
        btn.closest('.detail-card')?.remove();
        dashboardState.activeSessions = Math.max(1, dashboardState.activeSessions - 1);
        renderChecklistWidget();
        addTimelineEvent('Session revoked', 'Single device session removed');
        showToast('Session revoked', 'success');
      });
    });
  });

  document.getElementById('revoke-others-btn')?.addEventListener('click', async () => {
    if (!confirm('Revoke all other active sessions?')) return;
    const { ok } = await Auth.revokeOtherSessions();
    if (!ok) {
      showToast('Failed to revoke other sessions', 'error');
      return;
    }
    dashboardState.activeSessions = 1;
    renderChecklistWidget();
    addTimelineEvent('Session revoked', 'All other sessions removed');
    showToast('Other sessions revoked', 'success');
    document.getElementById('load-sessions-btn')?.click();
  });

  document.getElementById('load-audit-btn')?.addEventListener('click', async () => {
    const wrap = document.getElementById('audit-list');
    wrap.innerHTML = 'Loading activity...';
    const { ok, data } = await Auth.getAuditLogs();
    if (!ok) {
      wrap.innerHTML = 'Failed to load activity.';
      return;
    }
    if (!data.logs?.length) {
      wrap.innerHTML = 'No recent activity found.';
      return;
    }
    wrap.innerHTML = '';
    data.logs.forEach((log) => {
      const div = document.createElement('div');
      div.className = 'detail-card';
      div.innerHTML = `
        <div style="font-weight:700">${escHtml(log.event)}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary)">${new Date(log.createdAt).toLocaleString()} • ${escHtml(log.ip || 'unknown ip')}</div>`;
      wrap.appendChild(div);
    });
  });

  // ── Recovery Configure Modal ───────────────────────────────────────────────
  document.getElementById('configure-recovery-btn')?.addEventListener('click', () => {
    // SEC-03 FIX: check in-memory key instead of removed zk_master sessionStorage
    if (!VaultStore.getKey()) {
      showToast('Unlock vault first to configure recovery', 'error');
      return;
    }
    // Reset modal state
    document.getElementById('recovery-phrase-input').value = '';
    document.getElementById('recovery-hint-input').value = '';
    const errEl = document.getElementById('recovery-modal-error');
    errEl.classList.add('is-hidden');
    errEl.textContent = '';
    toggleModal('recovery-modal', true);
    document.getElementById('recovery-phrase-input').focus();
  });

  document.getElementById('recovery-modal-close')?.addEventListener('click', () => toggleModal('recovery-modal', false));
  document.getElementById('recovery-modal-cancel')?.addEventListener('click', () => toggleModal('recovery-modal', false));

  document.getElementById('recovery-modal-submit')?.addEventListener('click', async () => {
    const recoveryPhrase = document.getElementById('recovery-phrase-input').value.trim();
    const hint = document.getElementById('recovery-hint-input').value.trim();
    const errEl = document.getElementById('recovery-modal-error');
    const btn = document.getElementById('recovery-modal-submit');

    errEl.classList.add('is-hidden');
    errEl.textContent = '';

    if (!recoveryPhrase || recoveryPhrase.length < 12) {
      errEl.textContent = 'Recovery phrase must be at least 12 characters.';
      errEl.classList.remove('is-hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      // BUG-02 FIX: backend bcrypt-hashes the recoveryPhrase server-side
      const { ok, data } = await Auth.configureRecovery({
        recoveryPhrase,
        hint,
        encryptedMaster: '',
        iv: '',
        salt: '',
      });
      if (!ok) throw new Error(data?.message || 'Recovery setup failed');

      toggleModal('recovery-modal', false);
      document.getElementById('recovery-status').textContent =
        hint
          ? `Recovery configured. (Hint: ${hint})`
          : 'Recovery configured. Keep your recovery phrase offline.';
      dashboardState.recoveryEnabled = true;
      renderChecklistWidget();
      addTimelineEvent('Recovery configured', 'Recovery phrase enabled');
      showToast('Recovery phrase saved successfully ✓', 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('is-hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Recovery Phrase';
    }
  });


  async function refreshRecoveryStatus() {
    const el = document.getElementById('recovery-status');
    const { ok, data } = await Auth.getRecoveryStatus();
    if (!ok) {
      el.textContent = 'Could not load recovery status.';
      return;
    }
    el.textContent = data.enabled
      ? `Recovery enabled${data.hint ? ` (Hint: ${data.hint})` : ''}`
      : 'Recovery not configured.';
  }

  // ── Encrypted Export / Import ────────────────────────────────────────────
  document.getElementById('export-vault-btn')?.addEventListener('click', async () => {
    const passphrase = prompt('Enter a backup passphrase to encrypt this export:');
    if (!passphrase || passphrase.length < 8) {
      showToast('Backup passphrase must be at least 8 characters', 'error');
      return;
    }

    try {
      const backupSalt = ZKCrypto.generateSalt();
      const backupKey = await ZKCrypto.deriveKey(passphrase, backupSalt);
      const payload = JSON.stringify({
        exportedAt: new Date().toISOString(),
        entries: VaultStore.getEntries(),
      });
      const encrypted = await ZKCrypto.encryptVault(backupKey, payload);

      const backupDoc = {
        version: 1,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA256',
        salt: ZKCrypto.bufferToBase64(backupSalt),
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
      };

      const blob = new Blob([JSON.stringify(backupDoc, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `zkvault-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      localStorage.setItem('zk_last_backup_at', new Date().toISOString());
      renderChecklistWidget();
      addTimelineEvent('Backup exported', 'Encrypted backup file generated');
      showToast('Encrypted backup exported', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  document.getElementById('import-vault-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const passphrase = prompt('Enter backup passphrase to decrypt import:');
    if (!passphrase) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const key = await ZKCrypto.deriveKey(passphrase, parsed.salt);
      const plaintext = await ZKCrypto.decryptVault(key, parsed.ciphertext, parsed.iv);
      const payload = JSON.parse(plaintext);
      if (!Array.isArray(payload.entries)) {
        throw new Error('Invalid backup format.');
      }

      VaultStore.setEntries(payload.entries);
      await saveAndSync();
      refreshList();
      showToast('Encrypted backup imported', 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  // ── Password Health Dashboard ────────────────────────────────────────────
  function openHealthDashboard() {
    const entries = VaultStore.getEntries();
    const duplicates = RiskEngine.findDuplicates(entries);
    const oldMap = RiskEngine.findOldPasswords(entries);

    let weak = 0;
    let breached = 0;
    let duplicateCount = 0;
    let oldCount = 0;
    const riskyEntries = [];

    entries.forEach((entry) => {
      const audit = auditCache[entry.id] || { strength: RiskEngine.scorePassword(entry.password || ''), breached: false };
      const isWeak = audit.strength.score <= 2;
      const isBreached = !!audit.breached;
      const isDup = !!duplicates[entry.id];
      const isOld = !!oldMap[entry.id];

      if (isWeak) weak++;
      if (isBreached) breached++;
      if (isDup) duplicateCount++;
      if (isOld) oldCount++;

      if (isWeak || isBreached || isDup || isOld) {
        riskyEntries.push({
          title: entry.title || 'Untitled',
          reasons: [
            isWeak ? 'Weak password' : null,
            isBreached ? 'Breached' : null,
            isDup ? 'Reused password' : null,
            isOld ? `Old (${oldMap[entry.id]}d)` : null,
          ].filter(Boolean),
        });
      }
    });

    const breachMap = {};
    Object.entries(auditCache).forEach(([id, a]) => {
      breachMap[id] = { breached: !!a.breached };
    });
    const score = RiskEngine.calculateVaultScore(entries, breachMap);

    document.getElementById('health-summary').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <div><strong>Score:</strong> ${score.score} (${score.grade})</div>
        <div><strong>Total entries:</strong> ${entries.length}</div>
        <div><strong>Weak:</strong> ${weak}</div>
        <div><strong>Breached:</strong> ${breached}</div>
        <div><strong>Reused:</strong> ${Math.floor(duplicateCount / 2)}</div>
        <div><strong>Old (&gt;90d):</strong> ${oldCount}</div>
      </div>`;

    const risks = document.getElementById('health-risks');
    if (!riskyEntries.length) {
      risks.innerHTML = '<div class="detail-card">No risky entries found. Great job!</div>';
    } else {
      risks.innerHTML = '';
      riskyEntries.slice(0, 30).forEach((item) => {
        const div = document.createElement('div');
        div.className = 'detail-card';
        div.innerHTML = `<div style="font-weight:700">${escHtml(item.title)}</div><div style="font-size:0.8rem;color:var(--text-secondary)">${escHtml(item.reasons.join(' • '))}</div>`;
        risks.appendChild(div);
      });
    }

    toggleModal('health-modal', true);
  }

  document.getElementById('health-btn')?.addEventListener('click', openHealthDashboard);
  document.getElementById('health-modal-close')?.addEventListener('click', () => toggleModal('health-modal', false));

  // ── Share Entry ─────────────────────────────────────────────────────────
  document.getElementById('share-entry-btn')?.addEventListener('click', () => toggleModal('share-modal', true));
  document.getElementById('share-modal-close')?.addEventListener('click', () => toggleModal('share-modal', false));
  
  document.getElementById('share-submit-btn')?.addEventListener('click', async () => {
    if (!selectedId) return;
    const email = document.getElementById('share-email').value;
    if (!email) return showToast('Please enter an email', 'error');
    
    const btn = document.getElementById('share-submit-btn');
    btn.disabled = true;
    try {
      const { ok, data } = await Auth.apiFetch(`/api/shares/public-key/${encodeURIComponent(email)}`);
      if (!ok) throw new Error(data.message || 'Could not fetch public key');
      
      const pubKey = await ZKCrypto.importPublicKey(data.publicKey);
      const entry = VaultStore.getEntry(selectedId);
      const payload = JSON.stringify(entry);
      const encryptedPayload = await ZKCrypto.encryptRSA(pubKey, payload);
      
      const { ok: ok2, data: data2 } = await Auth.apiFetch('/api/shares', {
        method: 'POST',
        body: JSON.stringify({ receiverEmail: email, encryptedPayload })
      });
      if (!ok2) throw new Error(data2.message || 'Share failed');
      
      addTimelineEvent('Entry shared', `Shared with ${email}`);
      showToast('Shared securely via RSA-OAEP ✓', 'success');
      toggleModal('share-modal', false);
      document.getElementById('share-email').value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
    btn.disabled = false;
  });

  // ── Share Inbox ─────────────────────────────────────────────────────────
  document.getElementById('inbox-btn')?.addEventListener('click', async () => {
    toggleModal('inbox-modal', true);
    const list = document.getElementById('inbox-list');
    list.innerHTML = 'Loading...';
    try {
      const { ok, data } = await Auth.apiFetch('/api/shares');
      if (!ok) throw new Error();
      if (!data.shares.length) {
        list.innerHTML = 'No incoming shares.';
        return;
      }
      list.innerHTML = '';
      data.shares.forEach(s => {
        const div = document.createElement('div');
        div.className = 'detail-card';
        div.innerHTML = `
          <div style="font-weight:bold;margin-bottom:4px">From: ${escHtml(s.sender)}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px">${new Date(s.createdAt).toLocaleString()}</div>
          <button class="btn btn-primary btn-accept-share" data-id="${s.id}" data-payload="${s.encryptedPayload}">Accept to Vault</button>
        `;
        list.appendChild(div);
      });
      
      document.querySelectorAll('.btn-accept-share').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const payload = btn.dataset.payload;
            const rsaPriv = VaultStore.getRSAPrivateKey();
            if (!rsaPriv) throw new Error('RSA Private Key missing from vault');
            
            const plaintext = await ZKCrypto.decryptRSA(rsaPriv, payload);
            const entry = JSON.parse(plaintext);
            
            VaultStore.addEntry({
              title: entry.title + ' (Shared)',
              username: entry.username,
              password: entry.password,
              url: entry.url,
              notes: entry.notes,
              category: entry.category
            });
            await saveAndSync();
            
            await Auth.apiFetch(`/api/shares/${btn.dataset.id}`, { method: 'DELETE' });
            btn.parentElement.remove();
            refreshList();
            showToast('Entry merged into vault!', 'success');
          } catch (err) {
            showToast('Decryption failed. Invalid key?', 'error');
            console.error(err);
            btn.disabled = false;
          }
        });
      });
      
    } catch(err) {
      list.innerHTML = 'Failed to load inbox.';
    }
  });
  document.getElementById('inbox-modal-close')?.addEventListener('click', () => toggleModal('inbox-modal', false));

  // ── Utilities ─────────────────────────────────────────────────────────────
  function toggleModal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;

    // Use class-based visibility so all modals behave consistently with CSS.
    el.classList.toggle('is-hidden', !show);
    // Clear legacy inline display values from previous versions.
    el.style.display = '';
  }

  function closeTopModal() {
    const openModals = Array.from(document.querySelectorAll('.modal:not(.is-hidden), .modal-overlay:not(.is-hidden)'));
    const top = openModals[openModals.length - 1];
    if (top?.id) toggleModal(top.id, false);
  }

  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable;

    if (e.key === 'Escape') {
      closeTopModal();
      return;
    }

    if (isTyping) return;

    if (e.key === '/' && document.activeElement?.id !== 'search-input') {
      e.preventDefault();
      document.getElementById('search-input')?.focus();
      return;
    }

    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      toggleModal('add-modal', true);
      return;
    }

    if (e.key.toLowerCase() === 'g') {
      e.preventDefault();
      toggleModal('gen-modal', true);
      generatePassword();
    }
  });

  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  function getCategoryIcon(cat) {
    const icons = {
      Login: window.ZKIcons?.asset('key-entries') || '<i class="ph-fill ph-key"></i>',
      Email: window.ZKIcons?.asset('mail') || '<i class="ph-fill ph-envelope"></i>',
      Banking: window.ZKIcons?.asset('banking') || '<i class="ph-fill ph-bank"></i>',
      Social: window.ZKIcons?.asset('social-media') || '<i class="ph-fill ph-chat-circle"></i>',
      Shopping: window.ZKIcons?.asset('shopping') || '<i class="ph-fill ph-shopping-cart"></i>',
      Work: window.ZKIcons?.asset('work-accounts') || '<i class="ph-fill ph-briefcase"></i>',
      Note: window.ZKIcons?.asset('secure-notes') || '<i class="ph-fill ph-notepad"></i>'
    };
    const fallback = window.ZKIcons?.asset('app-logo') || '<i class="ph-fill ph-lock-key"></i>';
    return `<span class="zk-icon">${icons[cat] || fallback}</span>`;
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function refreshList() {
    applyCurrentListView();
    refreshVaultScore();
    renderDashboardWidgets();
  }

  // ── Real-time strength meter on new entry form ─────────────────────────────
  document.getElementById('add-password')?.addEventListener('input', (e) => {
    const s = RiskEngine.scorePassword(e.target.value);
    const bar = document.getElementById('add-strength-bar');
    const label = document.getElementById('add-strength-label');
    if (bar) { bar.style.width = ((s.score / 5) * 100) + '%'; bar.style.background = s.color; }
    if (label) { label.textContent = s.label; label.style.color = s.color; }
  });

  // ── Initial render ─────────────────────────────────────────────────────────
  refreshList();
  // Refresh when vault changes from other modules
  window.addEventListener('zk:vault:changed', () => { try { refreshList(); } catch (e) { console.error('refreshList failed', e); } });
  closeDetailPanel();
  refreshRecoveryStatus();
  refreshDashboardContext();
});
