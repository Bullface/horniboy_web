# Cloudflare Workers — branch previews

All Horniboy branches use the same Worker project name, `horniboy-web`, and produce static assets in `dist/`. Only the `cloudflare-worker` branch also bundles the metasearch API. A single Git-connected Workers project can preview the different editions without merging them or deploying preview code to production.

## One-time dashboard setup

In Workers & Pages, select the Git-connected Worker for Bullface/horniboy_web. In Settings > Builds, select:

| Setting | Value |
| --- | --- |
| Root directory | repository root |
| Production branch | main (or your existing intended production branch) |
| Build command | npm run build |
| Deploy command | npx --yes wrangler@latest deploy |
| Preview command | npx --yes wrangler@latest preview |
| Branch control | Enable Preview Builds |
| Node version | 22 (set NODE_VERSION=22 if necessary) |

Use Wrangler 4.135.0 or later for Worker Previews. If your existing project offers a Set up Worker Previews banner, review the settings and complete Cloudflare's one-time switch before using the new preview command. That switch cannot be reversed. If you choose to keep the legacy preview model instead, use its existing `npx --yes wrangler@latest versions upload` command; those are version URLs, not isolated branch environments. Do not use `wrangler deploy` as the preview command.

The shared name matches the existing Cloudflare Worker in the dashboard. If your dashboard uses a different name, ensure the configured name matches the connected Worker (Cloudflare Builds can supply its name override). For local manual deployment, use the intended Worker name explicitly rather than accidentally creating a different production Worker.

Pushes to the production branch use the deploy command; other branches use the preview command. If a branch was pushed before preview builds were enabled, trigger a build for it from the dashboard or push a new commit. Find the actual URL in the Worker's Previews section/build log. Do not guess the account subdomain.

## Editions

- main and cloudflare-web: static multi-shop search-link dashboard.
- browser-addon: hosted UI preview. Native windows require the locally installed Chrome/Edge extension; the hosted UI alone cannot control windows. Build locally or download the horniboy-build artifact from that branch's GitHub Actions workflow, extract it, and load the folder containing manifest.json as an unpacked extension. No webpage-to-extension bridge is implemented.
- cloudflare-worker: static UI plus /api/search and /api/config Worker endpoints. Protected or unavailable shop data is reported as unverified, not out of stock. Free-tier limits and provider restrictions still apply.

Each branch has an explicit Wrangler configuration with its own assets and, when needed, entry point. No production credentials or data bindings are required for a basic preview. Optional provider allowlists must be configured separately for previews. All previews are subject to the account's plan limits; use access controls if publishing private previews.

## Build fallback

The root package runs `npm run build` in its npm `postinstall` lifecycle, so `npm ci` or `npm clean-install` creates `dist/` even if the dashboard Build command is empty. Keep `npm run build` as the explicit Build command if desired; the build is repeatable. Do not disable npm lifecycle scripts. If lifecycle scripts are disabled, use `npm run build && npx wrangler preview` as the Preview command and `npm run build && npx wrangler deploy` as the Deploy command.

## Verification

The Cloudflare preview configuration workflow verifies a clean npm install generates dist without a separate build command, then runs a Wrangler deployment dry run (no deployment and no credentials). It also checks that the CLI supports the preview command. This does not create an authenticated Cloudflare preview, which must be done through the connected account.

Official documentation:
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://developers.cloudflare.com/workers/previews/get-started/
- https://developers.cloudflare.com/workers/previews/configuration/
