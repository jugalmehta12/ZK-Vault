/* ═══════════════════════════════════════════════════════════════════════════
   ZK Vault — Inline SVG Icon System
   Zero dependencies, zero CDN, zero CSP issues.
   Icons from Phosphor Icons (MIT) — https://phosphoricons.com
   ═══════════════════════════════════════════════════════════════════════════ */
window.ZKIcons = (() => {
  const S = (d, fill = false) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 256 256" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${fill ? 0 : 16}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const asset = (file, label = '') =>
    `<img class="zk-icon-img" src="icons/${file}" alt="${label}" aria-hidden="true" draggable="false" />`;

  const assetMap = {
    'app-logo': 'vault-svgrepo-com.svg',
    logo: 'vault-svgrepo-com.svg',
    'lock-key': 'vault-svgrepo-com.svg',
    'key-entries': 'keys-svgrepo-com.svg',
    key: 'keys-svgrepo-com.svg',
    mail: 'email-opened-svgrepo-com.svg',
    envelope: 'email-opened-svgrepo-com.svg',
    banking: 'banking-bank-svgrepo-com.svg',
    bank: 'banking-bank-svgrepo-com.svg',
    'social-media': 'message-circle-dots-svgrepo-com.svg',
    chat: 'message-circle-dots-svgrepo-com.svg',
    shopping: 'amazon-svgrepo-com.svg',
    cart: 'amazon-svgrepo-com.svg',
    'work-accounts': 'work-svgrepo-com.svg',
    briefcase: 'work-svgrepo-com.svg',
    'secure-notes': 'notepad-svgrepo-com.svg',
    notepad: 'notepad-svgrepo-com.svg',
    inbox: 'inbox-in-svgrepo-com.svg',
    tray: 'inbox-in-svgrepo-com.svg',
    'health-check': 'health-svgrepo-com.svg',
    heartbeat: 'health-svgrepo-com.svg',
    settings: 'settings-svgrepo-com.svg',
    gear: 'settings-svgrepo-com.svg',
  };

  // Stroke-based (outline) icons
  const outline = {
    list: S('<line x1="40" y1="128" x2="216" y2="128"/><line x1="40" y1="64" x2="216" y2="64"/><line x1="40" y1="192" x2="216" y2="192"/>'),
    gear: S('<circle cx="128" cy="128" r="40"/><path d="M130.05,206.11c-1.34,0-2.69,0-4,0L124,222.78a6,6,0,0,1-6.08,5.22H95.84a6.09,6.09,0,0,1-6-5.22l-2.08-16.71a80,80,0,0,1-19.4-11.19l-15.78,6.35A6,6,0,0,1,45.7,199l-11-19.12a6.06,6.06,0,0,1,1.22-7.46l13.68-10.35a79.93,79.93,0,0,1,0-22.38L35.91,129.31A6,6,0,0,1,34.69,121.85l11-19.12a6,6,0,0,1,6.89-2.77l15.78,6.35A80,80,0,0,1,87.74,95.12l2.08-16.71a6.07,6.07,0,0,1,6-5.22h22.08a6,6,0,0,1,6.08,5.22l2.08,16.71a80,80,0,0,1,19.4,11.19l15.78-6.35a6,6,0,0,1,6.89,2.77l11,19.12a6.06,6.06,0,0,1-1.22,7.46l-13.68,10.35a79.93,79.93,0,0,1,0,22.38l13.68,10.35a6,6,0,0,1,1.22,7.46l-11,19.12a6,6,0,0,1-6.89,2.77l-15.78-6.35a80,80,0,0,1-19.4,11.19Z"/>'),
    tray: S('<path d="M48,176H88l16,24h48l16-24h40"/><rect x="32" y="48" width="192" height="160" rx="8"/>'),
    heartbeat: S('<polyline points="32 128 72 128 88 104 120 152 136 128 160 128"/><path d="M28,128A52,52,0,0,1,128,76c33.34,0,54.86,20.41,67.13,40H216"/>'),
    folders: S('<rect x="24" y="64" width="168" height="128" rx="8"/><path d="M64,64V40a8,8,0,0,1,8-8H218a8,8,0,0,1,8,8V152a8,8,0,0,1-8,8H192"/>'),
    clock: S('<circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/>'),
    'clock-counter': S('<polyline points="72 104 32 104 32 64"/><path d="M67.6,192A96,96,0,1,0,32,128"/><polyline points="128 72 128 128 184 128"/>'),
    warning: S('<path d="M114.15,39.87,26.17,200.75A16,16,0,0,0,40,224H216a16,16,0,0,0,13.85-23.25L141.85,39.87A16,16,0,0,0,114.15,39.87Z"/><line x1="128" y1="136" x2="128" y2="104"/><circle cx="128" cy="172" r="4" fill="currentColor"/>'),
    'lock-open': S('<rect x="48" y="112" width="160" height="112" rx="8"/><path d="M88,112V80a40,40,0,0,1,40-40c19.12,0,35.58,13.38,39.41,32"/>'),
    dice: S('<rect x="32" y="32" width="192" height="192" rx="24"/><circle cx="100" cy="100" r="12" fill="currentColor"/><circle cx="156" cy="100" r="12" fill="currentColor"/><circle cx="100" cy="156" r="12" fill="currentColor"/><circle cx="156" cy="156" r="12" fill="currentColor"/><circle cx="128" cy="128" r="12" fill="currentColor"/>'),
    receipt: S('<path d="M32,208V56a8,8,0,0,1,8-8H216a8,8,0,0,1,8,8V208l-32-16-32,16-32-16L96,208,64,192Z"/><line x1="76" y1="104" x2="180" y2="104"/><line x1="76" y1="136" x2="180" y2="136"/>'),
    lightbulb: S('<path d="M80,168h96"/><path d="M88,232h80"/><path d="M83.27,154A72,72,0,1,1,173.7,100.7c.09.1-7.48,21.3-13.7,36.17A8,8,0,0,1,152.61,142H103.39a8,8,0,0,1-7.39-4.87C89.77,122.06,83.18,100.8,83.27,154Z"/>'),
    'check-circle': S('<circle cx="128" cy="128" r="96"/><polyline points="88 136 112 160 168 104"/>'),
    'chart-bar': S('<rect x="32" y="72" width="40" height="152"/><rect x="108" y="32" width="40" height="192"/><rect x="184" y="112" width="40" height="112"/>'),
    keyboard: S('<rect x="24" y="56" width="208" height="144" rx="8"/><line x1="64" y1="128" x2="192" y2="128"/><line x1="96" y1="96" x2="96" y2="96.01"/><line x1="128" y1="96" x2="128" y2="96.01"/><line x1="160" y1="96" x2="160" y2="96.01"/><line x1="64" y1="96" x2="64" y2="96.01"/><line x1="192" y1="96" x2="192" y2="96.01"/><line x1="96" y1="160" x2="160" y2="160"/>'),
    trash: S('<line x1="216" y1="56" x2="40" y2="56"/><line x1="104" y1="104" x2="104" y2="168"/><line x1="152" y1="104" x2="152" y2="168"/><path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56"/><path d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56"/>'),
    copy: S('<rect x="40" y="72" width="144" height="152" rx="8"/><path d="M72,72V40a8,8,0,0,1,8-8H216a8,8,0,0,1,8,8V176a8,8,0,0,1-8,8H184"/>'),
    eye: S('<path d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Z"/><circle cx="128" cy="128" r="40"/>'),
    'eye-slash': S('<line x1="48" y1="40" x2="208" y2="216"/><path d="M154.91,157.6a40,40,0,0,1-53.82-53.82"/><path d="M73.87,93.48Q46.06,113.15,28,140c0,0,32,72,112,72a118.05,118.05,0,0,0,52.38-12.6"/><path d="M208.39,129.42A160.77,160.77,0,0,0,240,128S208,56,128,56a118,118,0,0,0-20.11,1.7"/>'),
    'arrow-out': S('<polyline points="192 104 192 64 152 64"/><line x1="136" y1="120" x2="192" y2="64"/><path d="M136,40H56a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H200a8,8,0,0,0,8-8V120"/>'),
    search: S('<circle cx="112" cy="112" r="80"/><line x1="176" y1="176" x2="224" y2="224"/>'),
    floppy: S('<path d="M216,83.31V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8H172.69a8,8,0,0,1,5.65,2.34l35.32,35.32A8,8,0,0,1,216,83.31Z"/><rect x="88" y="152" width="80" height="64"/><line x1="152" y1="40" x2="152" y2="80"/>'),
    x: S('<line x1="200" y1="56" x2="56" y2="200"/><line x1="200" y1="200" x2="56" y2="56"/>'),
  };

  // Filled icons (for category badges, logo, etc.)
  const filled = {
    'lock-key': S('<path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80Zm-80,84a12,12,0,1,1,12-12A12,12,0,0,1,128,164Zm32-84H96V56a32,32,0,0,1,64,0Z"/>', true),
    key: S('<path d="M216.57,39.43A56,56,0,0,0,143.28,119l-75,75A8,8,0,0,0,66,200v24a8,8,0,0,0,8,8H96a8,8,0,0,0,8-8V208h16a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.06-9.06A56,56,0,0,0,216.57,39.43ZM184,96a16,16,0,1,1,16-16A16,16,0,0,1,184,96Z"/>', true),
    envelope: S('<path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM128,148.72,45.07,80H210.93ZM40,192V93.28l81.44,67.86a8,8,0,0,0,10.24,0L216,93.28V192Z"/>', true),
    bank: S('<path d="M24,104H232l-104-72Z"/><rect x="40" y="104" width="32" height="80"/><rect x="112" y="104" width="32" height="80"/><rect x="184" y="104" width="32" height="80"/><rect x="16" y="184" width="224" height="32" rx="8"/>', true),
    chat: S('<path d="M216,48H40A16,16,0,0,0,24,64V222.77a15.69,15.69,0,0,0,9.22,14.31A16.11,16.11,0,0,0,40,238a15.69,15.69,0,0,0,10.25-3.78h0L76.69,212H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48Z"/>', true),
    cart: S('<path d="M233,80.36l-26,90.85A16,16,0,0,1,191.62,182H84.07A16,16,0,0,1,68.7,171.51l-42.14-120A8,8,0,0,0,19,46H8"/><circle cx="88" cy="216" r="20"/><circle cx="192" cy="216" r="20"/>', true),
    briefcase: S('<rect x="32" y="72" width="192" height="144" rx="8"/><path d="M168,72V56a16,16,0,0,0-16-16H104A16,16,0,0,0,88,56V72"/><line x1="32" y1="136" x2="224" y2="136"/>', true),
    notepad: S('<rect x="40" y="24" width="176" height="208" rx="8"/><line x1="88" y1="72" x2="168" y2="72"/><line x1="88" y1="112" x2="168" y2="112"/><line x1="88" y1="152" x2="128" y2="152"/>', true),
    shield: S('<path d="M40,114V56a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8v58c0,51.16-35.76,90.7-83.2,103.43a7.89,7.89,0,0,1-5.6,0C79.76,204.7,44,165.16,40,114Z"/><polyline points="88 136 112 160 168 104"/>', true),
  };

  return {
    /** Get an SVG icon by name. @param {string} name */
    get(name) {
      if (assetMap[name]) return asset(assetMap[name], name);
      return outline[name] || filled[name] || outline.x;
    },
    /** Get a filled SVG icon. @param {string} name */
    fill(name) {
      if (assetMap[name]) return asset(assetMap[name], name);
      return filled[name] || outline[name] || outline.x;
    },
    /** Get a file-based icon for custom UI surfaces. @param {string} name */
    asset(name) {
      if (!assetMap[name]) return outline.x;
      return asset(assetMap[name], name);
    }
  };
})();

/* ── Auto-inject: convert all <i class="ph ph-xxx"> to inline SVGs ───────── */
document.addEventListener('DOMContentLoaded', () => {
  // Map Phosphor class names to our icon keys
  const classMap = {
    'ph-list': 'list',
    'ph-lock-key': 'app-logo',
    'ph-tray': 'inbox',
    'ph-heartbeat': 'health-check',
    'ph-gear': 'settings',
    'ph-folders': 'folders',
    'ph-clock-counter-clockwise': 'clock-counter',
    'ph-warning-circle': 'warning',
    'ph-lock-open': 'lock-open',
    'ph-dice-five': 'dice',
    'ph-clock': 'clock',
    'ph-lightbulb': 'lightbulb',
    'ph-check-circle': 'check-circle',
    'ph-chart-bar': 'chart-bar',
    'ph-receipt': 'receipt',
    'ph-keyboard': 'keyboard',
    'ph-trash': 'trash',
    'ph-copy': 'copy',
    'ph-eye': 'eye',
    'ph-eye-slash': 'eye-slash',
    'ph-arrow-square-out': 'arrow-out',
    'ph-magnifying-glass': 'search',
    'ph-floppy-disk': 'floppy',
    'ph-x': 'x',
    'ph-key': 'key-entries',
    'ph-shield-check': 'shield',
    'ph-envelope': 'mail',
    'ph-bank': 'banking',
    'ph-chat-circle': 'social-media',
    'ph-shopping-cart': 'shopping',
    'ph-briefcase': 'work-accounts',
    'ph-notepad': 'secure-notes',
  };

  document.querySelectorAll('i[class*="ph"]').forEach(el => {
    const classes = el.className.split(/\s+/);
    const isFill = classes.includes('ph-fill');
    let iconName = null;

    for (const cls of classes) {
      if (classMap[cls]) { iconName = classMap[cls]; break; }
    }
    if (!iconName) return;

    const span = document.createElement('span');
    span.className = 'zk-icon';
    span.innerHTML = isFill ? ZKIcons.fill(iconName) : ZKIcons.get(iconName);
    el.replaceWith(span);
  });
});
