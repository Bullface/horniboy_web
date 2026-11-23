// Loads independently of app.js so diagnostics remain available if the app fails to initialize.
const VERSION = 'web-2.1.0';
const MAX_EVENTS = 80;
const events = [];
const assetPaths = ['./app.js', './core.js', './presets.js', './styles.css'];
let latestChecks = [];
let checking = false;

const node = id => document.getElementById(id);
const redact = value => String(value ?? '').replace(/https?:\/\/[^\s)]+/g, match => {
  try { const url = new URL(match); return `${url.origin}${url.pathname}`; } catch { return '[URL]'; }
}).slice(0, 500);
function record(kind, message) {
  events.push({ time: new Date().toISOString(), kind, message: redact(message) });
  if (events.length > MAX_EVENTS) events.shift();
  if (node('diagnostics-dialog')?.open) refresh();
}
function status() {
  return {
    build: VERSION,
    time: new Date().toISOString(),
    page: `${location.origin}${location.pathname}`, // no search keywords or URL fragments
    online: navigator.onLine,
    mainAppStarted: Boolean(window.__horniboyReady),
    browser: navigator.userAgent,
    supports: {
      modules: 'noModule' in document.createElement('script'),
      localStorage: canUseLocalStorage(),
      clipboard: Boolean(navigator.clipboard?.writeText),
      secureContext: window.isSecureContext,
    },
    checks: latestChecks,
    events: [...events],
  };
}
function canUseLocalStorage() {
  try {
    const key = '__horniboy_diag_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
function refresh() {
  const report = status();
  const summary = node('diagnostics-summary');
  const output = node('diagnostics-output');
  if (!summary || !output) return;
  const errors = report.events.filter(e => ['error', 'rejection', 'asset-error', 'csp'].includes(e.kind)).length;
  const failedChecks = report.checks.filter(c => !c.ok).length;
  summary.textContent = `${report.mainAppStarted ? '✓ Anwendung gestartet' : '⚠ Anwendung nicht gestartet'} · ${report.checks.length ? `${report.checks.length - failedChecks}/${report.checks.length} Assets erreichbar` : 'Asset-Prüfung noch nicht gestartet'} · ${errors} Fehler protokolliert`;
  output.textContent = JSON.stringify(report, null, 2);
}
async function runChecks() {
  if (checking) return;
  checking = true;
  const button = node('diagnostics-check');
  if (button) button.disabled = true;
  try {
    const checks = [];
    for (const path of assetPaths) {
      try {
        const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
        const contentType = response.headers.get('content-type') || '(kein Content-Type)';
        const validType = path.endsWith('.css') ? contentType.includes('css') : contentType.includes('javascript');
        const ok = response.ok && validType;
        checks.push({ asset: path, ok, status: response.status, contentType });
        if (!ok) record('asset-error', `${path}: HTTP ${response.status}; Content-Type ${contentType}`);
      } catch (error) {
        checks.push({ asset: path, ok: false, reason: redact(error?.message) });
        record('asset-error', `${path}: ${error?.message}`);
      }
    }
    latestChecks = checks;
    record('info', 'Same-origin asset check completed');
  } finally {
    checking = false;
    if (button) button.disabled = false;
    refresh();
  }
}
function downloadReport() {
  const data = JSON.stringify(status(), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'horniboy-diagnostics.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener('error', event => {
  const asset = event.target;
  if (asset && asset !== window) {
    record('asset-error', `Resource failed: ${asset.tagName ?? 'unknown'} ${asset.src ?? asset.href ?? ''}`);
  } else {
    record('error', `${event.message || 'Uncaught error'} (${event.filename ? redact(event.filename) : 'unknown'}:${event.lineno || '?'})`);
  }
}, true);
window.addEventListener('unhandledrejection', event => record('rejection', event.reason?.message || event.reason || 'Unknown rejected promise'));
document.addEventListener('securitypolicyviolation', event => record('csp', `${event.violatedDirective}: ${event.blockedURI || 'inline'}`));
window.addEventListener('online', () => record('info', 'Browser is online'));
window.addEventListener('offline', () => record('info', 'Browser is offline'));

window.horniboyDiagnostics = Object.freeze({ record, getReport: status, runChecks });

function initialize() {
  node('diagnostics-btn')?.addEventListener('click', () => {
    refresh();
    node('diagnostics-dialog').showModal();
    void runChecks();
  });
  node('diagnostics-close')?.addEventListener('click', () => node('diagnostics-dialog').close());
  node('diagnostics-check')?.addEventListener('click', () => void runChecks());
  node('diagnostics-download')?.addEventListener('click', downloadReport);
  node('diagnostics-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(status(), null, 2));
      record('info', 'Diagnostics copied to clipboard');
    } catch (error) { record('error', `Copy failed: ${error.message}`); }
  });
  record('info', `Diagnostic runtime ${VERSION} initialized`);
  if (new URLSearchParams(location.search).get('debug') === '1') {
    node('diagnostics-dialog').showModal();
    void runChecks();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();