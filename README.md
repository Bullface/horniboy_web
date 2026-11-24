# Horniboy — Browser add-on

Free Chromium Manifest V3 extension, based on the compact interface of the first Horniboy commit (4fdad48b39a2e7f1dec71baf877fa436ed9091c9). Gray toolbar, history ribbon, site toggles and restrained folk-pattern accents. No remote rendering, account or paid API.

## Install (Chrome / Edge desktop)
1. Download this branch as ZIP or clone it.
2. Run npm ci and npm run build with Node 20+ (or use the CI artifact named horniboy-build).
3. Open chrome://extensions or edge://extensions, enable Developer mode, choose Load unpacked, select dist/ (or the extracted CI artifact containing manifest.json).
4. Pin the Horniboy extension and click its toolbar icon. Enter a product and Search.

The control window opens on the selected monitor; real shop windows tile beneath it. Use site checkboxes, previous/next batches and the Columns selector. Real shop pages retain their usual cookies, navigation and stock information. This is **not** an iframe or a single embedded browser tab. Native window placement is subject to OS/browser minimum window sizes and window manager behavior; on a small screen, fewer shops fit. The extension reuses its own tabs and removes only managed tabs when changing batches or closing; unrelated tabs are left alone. The status "Page loaded" means the browser load completed, not that a product is available or the page returned HTTP 200.

## Dynamic websites
Sites -> one line per name and HTTPS search URL template, separated by a pipe. Use the literal placeholder {search_keyword}. The five original providers are preconfigured. OBI uses the canonical trailing-slash search path; BAUHAUS uses its current /suche/produkte?text= search path. Original store filters are configurable rather than tied to a possibly stale store ID. Up to 24 providers. No host permissions, no content injection or header modifications. Storage is local; the extension uses storage.session to track its own windows and system.display to calculate available monitor geometry.

## Tests
npm run check runs shared validation, layout, native window lifecycle tests with a mocked Chrome API and builds dist. The separate Chromium workflow runs a real unpacked extension with two controlled fixture stores, creates two native windows, and checks cleanup. This does not verify every operating system's visual placement or live shop stock. Use the built-in Debug dialog for technical event export. Check the actual CI runs before installing.

## Deployment
A regular hosted website cannot control arbitrary native browser windows without an installed add-on. This branch is the installed version; the separate cloudflare-worker branch is the no-install website. No production branch has to be replaced.
