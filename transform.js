const fs = require('fs');
let css = fs.readFileSync('css/admin.css', 'utf8');

// 1. Add font imports if not present
if (!css.includes('@import url')) {
  css = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=Barlow:wght@400;500;600&family=Bebas+Neue&display=swap');\n` + css;
}

// 2. Redefine fonts in :root if not present, and update body
// Actually, theme.css defines variables, but admin.css might use them. Let's just prepend to body styling.
css = css.replace(/body\s*{([^}]*)}/, (match, p1) => {
  return `body {${p1}\n  background-color: #050505;\n  color: #f0f0f0;\n  font-family: 'Barlow', sans-serif;\n  -webkit-font-smoothing: antialiased;\n}\n\nbody::before {\n  content: "";\n  position: fixed;\n  top: 0; left: 0; width: 100%; height: 100%;\n  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");\n  opacity: 0.04;\n  z-index: 0;\n  pointer-events: none;\n}\n`;
});

// 3. Inject our own CSS variables to override theme.css (since admin.css is loaded after)
const rootOverride = `
:root {
  --gold: #e5b320 !important;
  --gold2: #ffcc33 !important;
  --dark: #0a0a0c !important;
  --black: #050505 !important;
  --card: rgba(10, 10, 12, 0.7) !important;
  --border: rgba(255, 255, 255, 0.1) !important;
  --font-display: 'Bebas Neue', sans-serif !important;
  --font-cond: 'Barlow Condensed', sans-serif !important;
  --font-mono: 'Barlow', monospace !important;
}
`;

css = css.replace(/@import url\([^\)]+\);\n/, match => match + rootOverride);

// 4. Update elements to have glassmorphism
css = css.replace(/\.form-card\s*{([^}]*)}/g, (match, p1) => {
  return `.form-card {${p1}\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n  box-shadow: 0 10px 30px rgba(0,0,0,0.5);\n}`;
});

css = css.replace(/\.sidebar\s*{([^}]*)}/g, (match, p1) => {
  return `.sidebar {${p1}\n  backdrop-filter: blur(20px);\n  background: rgba(10,10,12,0.85) !important;\n}`;
});

css = css.replace(/\.topbar\s*{([^}]*)}/g, (match, p1) => {
  return `.topbar {${p1}\n  backdrop-filter: blur(20px);\n  background: rgba(10,10,12,0.85) !important;\n}`;
});

// Update tables to look cleaner
css = css.replace(/\.admin-table th\s*{([^}]*)}/g, (match, p1) => {
  return `.admin-table th {${p1}\n  font-family: var(--font-cond) !important;\n  font-size: 0.85rem !important;\n  color: var(--gold) !important;\n}`;
});

// Make buttons cinematic
css = css.replace(/\.btn-gold\s*{([^}]*)}/g, (match, p1) => {
  return `.btn-gold {${p1}\n  background: var(--gold) !important;\n  color: #000 !important;\n  font-family: var(--font-cond) !important;\n  letter-spacing: 1px;\n  text-transform: uppercase;\n  border: none;\n  box-shadow: 0 4px 15px rgba(229, 179, 32, 0.3);\n  transition: all 0.3s ease;\n}\n.btn-gold:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(229, 179, 32, 0.5); }`;
});

fs.writeFileSync('css/admin.css', css);
console.log('Done transforming');
