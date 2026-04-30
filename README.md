# Bookmarks Cleanup

Personal-use web app for cleaning a browser bookmarks export. Drop in the HTML
file, prune what you don't want, run a server-side link check, and export an
HTML file to re-import.

Works with exports from Chrome, Firefox, Edge, Brave, Opera, Vivaldi, Arc, and
DuckDuckGo. Safari is out of scope (its export format differs).

Deployed on Cloudflare Pages with a Pages Function for the link-check
endpoint.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` runs `wrangler pages dev`, which serves `public/` and discovers
the function at `functions/api/check-links.js` automatically. If Wrangler
isn't already installed it'll be picked up via the local `devDependencies`;
to install globally:

```bash
npm install -g wrangler
```

Then open the URL Wrangler prints (typically <http://127.0.0.1:8788>).

### Local secret

The link-check endpoint requires a shared token to keep the public deployment
from being abused. For local dev, drop a value into `.dev.vars` (gitignored):

```
BOOKMARKS_TOKEN=local-dev-token
```

The frontend reads its token from a `<meta name="bookmarks-token">` tag in
`public/index.html`. Match the two for local dev. See "Deployment" for the
production setup.

## Deployment

This repo deploys to Cloudflare Pages via the Git integration: pushing to
`main` triggers an automatic build and deploy. Branch pushes get free
preview deployments.

The custom domain (`bookmarks.brightsite.digital`) is mapped in the
Cloudflare dashboard, not in code.

### Production secret

`BOOKMARKS_TOKEN` lives in the Cloudflare dashboard:

> Project → **Settings** → **Environment variables** → Production →
> add `BOOKMARKS_TOKEN`

Set the same value (or a different production-only one) in
`public/index.html`'s `<meta name="bookmarks-token">` content attribute. Ship
that change with the deploy. The token is visible in page source — this is
casual abuse prevention, not real security.

### Endpoint behaviour

`POST /api/check-links`

| Header | |
| --- | --- |
| `X-Bookmarks-Cleanup-Token` | must match `env.BOOKMARKS_TOKEN` |
| `Content-Type` | `application/json` |

Body: `{ "urls": string[] }`, 1..2000 entries. Response is
`application/x-ndjson` — one `{url, status, code, reason}` per line, written
as each probe completes.

| Status | Meaning |
| --- | --- |
| `200` | streaming NDJSON |
| `400` | bad body / too many URLs |
| `401` | bad / missing token |
| `503` | server has no `BOOKMARKS_TOKEN` configured |

## How to use

1. **Export from your browser** — see "How do I export my bookmarks?" in the
   app for the menu path per browser.
2. **Drop the HTML file** on the page. It's parsed in your browser; nothing
   leaves the page until you opt into a link check.
3. **Filter, search, and prune** — folder, age, status, or title/URL search.
   Tick rows and delete in bulk. Undo covers the last 20 deletions.
4. **Drop pre-YYYY** — pick a year and bulk-drop everything older. Two-click
   confirm. Undated bookmarks are never matched by year cutoff.
5. **Check links** (optional) — Function probes every URL with concurrency 20.
   Status badges fill in row by row. Cancel any time.
6. **Drop all dead** — appears once dead links are detected. Two-click confirm.
   "Error" rows are flagged in amber and never bulk-deleted; review manually
   via the Status filter.
7. **Export bookmarks HTML** — downloads `bookmarks-cleaned-YYYY-MM-DD.html`.

### Before you re-import

Importing the cleaned HTML **adds** bookmarks alongside what's already in
your browser. Without clearing first, anything you didn't delete here will
be duplicated. Keep the export file as your backup, then in your browser's
bookmark manager: select all in each top-level section (Bookmarks bar /
Other bookmarks / Bookmarks Toolbar / etc.) and delete. The in-app
collapsible "How do I clear existing bookmarks before re-import?" has the
per-browser steps.

## Link-check classification

- **Concurrency:** 20 simultaneous requests
- **Timeout:** 15s per probe (Cloudflare `fetch` doesn't separate connect /
  body timeouts)
- **HEAD-then-GET:** HEAD first; falls back to GET on 405/501 or any non-
  terminal HEAD failure (timeouts, socket hangups, sites that bot-block HEAD)
- **TLS:** Workers `fetch` validates certs and there's no opt-out — sites
  with broken / expired certs land in `error`, not `alive` (a small drift
  from the original Node backend, called out here so it doesn't surprise)
- **Categories:**
  - `dead` — HTTP 404/410, DNS failure, connection refused. Safe to bulk-drop.
  - `alive` — anything responsive, including 403 and 5xx. Often false-positive
    on bot blocking and Cloudflare protection; kept.
  - `error` — timeouts, TLS oddities, socket resets, anything weird. Flagged
    amber, never bulk-deleted.

No bookmark data other than URLs ever leaves the page.

## File layout

```
.
├── functions/
│   └── api/
│       └── check-links.js   Pages Function — POST /api/check-links
├── public/                  static frontend (Pages output dir)
│   ├── index.html
│   ├── styles.css
│   ├── favicon.svg
│   ├── brand/               BrightSite wordmark assets
│   └── app/
│       ├── main.js          boot + glue
│       ├── parser.js        Netscape Bookmark format → flat array
│       ├── filters.js       pure filter predicates
│       ├── store.js         in-memory state + undo stack
│       ├── confirm.js       single-listener inline confirm pattern
│       ├── exporter.js      Netscape Bookmark format reconstruction
│       ├── linkcheck-client.js  fetch + NDJSON reader
│       └── ui/
│           ├── toolbar.js
│           ├── stats.js
│           ├── table.js
│           └── toast.js
├── wrangler.toml            Pages config for `wrangler pages dev`
├── .dev.vars                local-only secrets (gitignored)
└── README.md
```

## What this app is not

- Not multi-user. The token is casual abuse prevention, not auth.
- Not a bookmarks manager — once you export and re-import, the tool's job
  is done.
- Not a Safari export reader.
