# Stack

## Frontend (static)

- Vanilla HTML / CSS / JS, ES modules in the browser via
  `<script type="module">`. **No framework, no bundler, no build step.**
- BrightSite design tokens (Sage / Cream / Charcoal) and the Avenir Next font
  stack expressed as plain CSS variables in `public/styles.css`.
- Hand-written Netscape Bookmark parser using the browser's native
  `DOMParser` API (`public/app/parser.js`).
- Inline two-click confirm pattern with one shared document listener +
  `WeakMap` (`public/app/confirm.js`) — avoids the listener-stacking bug.
- NDJSON-streaming link-check client built on `fetch` + `ReadableStream`
  (`public/app/linkcheck-client.js`).

## Backend (current)

- **Cloudflare Pages** for static hosting (`public/` is the build output dir).
- **Pages Function** at `functions/api/check-links.js` running on the Workers
  runtime. Handles `POST /api/check-links`.
- Workers-standard APIs only: `fetch`, `ReadableStream`, `TextEncoder`,
  `AbortController`. No Node deps, no `process`, no `fs`.
- 20-wide async pool, 15s `AbortController` per probe, HEAD-then-GET
  fallback, NDJSON response (one `{url, status, code, reason}` per line).
- Shared-secret header (`X-Bookmarks-Cleanup-Token` matched against
  `env.BOOKMARKS_TOKEN`) for casual abuse prevention.

## Local development

- **Wrangler** (`wrangler pages dev`, exposed as `npm run dev`) — serves
  `public/` and auto-discovers `functions/api/check-links.js`. Wrangler is
  the only runtime dependency.
- `.dev.vars` (gitignored) holds the local `BOOKMARKS_TOKEN`.
- The frontend reads its token from a `<meta name="bookmarks-token">` tag in
  `public/index.html`; match the meta value to `.dev.vars` for local runs.

## Backend (legacy, in repo until removed)

- Node 20 + Fastify + `@fastify/static` + `undici` (`server.js`,
  `lib/linkcheck.js`). Replaced by the Pages Function. Queued for deletion
  once the Cloudflare deploy has been verified end-to-end.

## Deploy

- Cloudflare Pages Git integration — push to `main` triggers an automatic
  build and deploy. Branch pushes get free preview URLs.
- Custom domain (`bookmarks.brightsite.digital`) mapped in the Cloudflare
  dashboard, not in code.
- Production `BOOKMARKS_TOKEN` set in
  Project → Settings → Environment variables → Production.

## Storage / state

- **None server-side.** All bookmark data lives in browser memory for the
  session.
- The server only ever sees URLs, and only during an opt-in link check —
  never titles, folder names, or descriptions.

## File layout (top-level)

```
.
├── functions/api/check-links.js   Pages Function — POST /api/check-links
├── public/                        Pages output dir (the SPA)
│   ├── index.html
│   ├── styles.css
│   ├── favicon.svg
│   ├── brand/                     BrightSite wordmark assets
│   └── app/                       ES modules: parser, store, confirm,
│                                   filters, exporter, linkcheck-client,
│                                   ui/{toolbar,stats,table,toast}
├── wrangler.toml                  Pages config for `wrangler pages dev`
├── .dev.vars                      local-only secrets (gitignored)
├── package.json                   wrangler as devDependency
├── README.md
├── SPEC.md
└── STACK.md                       this file
```
