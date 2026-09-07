# Safari Support — Build Spec

**App:** bookmarks.brightsite.digital
**Written:** 6 September 2026
**For:** a build agent (VS Code + Codex or Claude Code)
**Repo:** `github.com/mjmcmahon/bookmarks-cleanup` — deployed files verified byte-identical to repo HEAD, so every measurement below holds against the source you'll edit.
**Status of findings below:** verified against Mike's real Safari export and the live shipped source unless explicitly marked as an assumption.

---

## 1. Why this is not just "add a format"

Safari files do not fail to load today. They load, look fine, and **silently discard about two thirds of the bookmarks.**

Measured against `Safari Export 2026-09-06/Bookmarks.html` (Mike's real export, 138 bookmarks, 16 top-level folders, one of them empty), running the **currently deployed** `public/app/parser.js` in a real browser DOM:

| | Expected | Actual today |
|---|---|---|
| Bookmarks parsed | 138 | **44** |
| Bookmarks silently lost | 0 | **94 (68%)** |
| Top-level folders seen | 15 (16 minus one empty folder) | **0** (all lost) |
| Error shown to user | — | **none** |
| Bookmarks with a usable date | 0 | 0 |

The parse returns cleanly, the table renders, the stats row says "44 bookmarks", and Export produces a file you can re-import. Anyone who tried Safari on a hunch and re-imported the result would have quietly destroyed their bookmarks.

**Treat this as a data-loss defect first and a feature second.** The footer currently says "Safari support coming later", which is the only thing preventing harm right now. Do not remove that line until the parser fix is verified.

### Root cause

Chrome and every other supported browser wrap the whole tree in one top-level `<DL>`:

```
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Bookmarks Bar</H3>
  <DL><p> ... </DL><p>
</DL><p>
```

Safari has no wrapping `<DL>`. Top-level folders are bare siblings:

```
<H1>Bookmarks</H1>
<DT><H3>Favorites</H3>
<DL><p> ... </DL><p>
<DT><H3>Bookmarks Menu</H3>
<DL><p> ... </DL><p>
```

`parser.js` does `doc.querySelector('body > dl') || doc.querySelector('dl')`. With no wrapping `<DL>`, the first selector misses and the second grabs **the Favorites folder's own children list**. The walk then starts inside Favorites, so:

- everything outside Favorites is never visited (94 bookmarks),
- Favorites' own direct bookmarks come back with `folder_path: []` (orphans),
- Favorites' subfolders (`Toronto`, `Banking`, `work`, `Apple`, `News`) are promoted to top-level roots.

---

## 2. Verified facts about Safari's export format

From the real file. All confirmed, none assumed.

- **No `ADD_DATE`. No `LAST_MODIFIED`, `LAST_VISIT` or `ICON` on any element.** Zero dated bookmarks out of 138.
- **No wrapping top-level `<DL>`** (section 1).
- **No `PERSONAL_TOOLBAR_FOLDER` attribute** anywhere. Safari does not mark its toolbar folder on export.
- **Root folders:** `Favorites` (the toolbar equivalent) and `Bookmarks Menu` come first, then every other top-level folder as a flat sibling list. There is no `Other Bookmarks` container — Safari has N roots, not Chrome's 3.
- **Structure:** opens `<HTML>`, closes `</HTML>`, no `<BODY>`, tab-indented, `<DT>`/`<p>` unclosed. Same `<!DOCTYPE NETSCAPE-Bookmark-file-1>` as everyone else.
- **Empty folders are emitted** (`<DT><H3>Brightsite</H3><DL><p></DL><p>`). The exporter builds folders from bookmark paths only, so these are dropped on round-trip. Low-stakes fidelity loss; see 5.4.
- **Non-HTTP schemes are common.** In this file: 85 `http`, 17 `https`, **35 `feed://`, 1 `javascript:`** — 26% of the file is not link-checkable.
- **No Reading List.** Mike didn't export it and believes it lives elsewhere. If a `Reading List` folder ever appears it is an ordinary `<H3>` folder and needs no special handling. Do not build for it.

### Test fixture

`Bookmarks Cleanup Tool/Safari Export 2026-09-06.zip` → `Safari Export 2026-09-06/Bookmarks.html`, used locally as `test/fixtures/safari-2026-09-06.html`. It is Mike's real, old, messy bookmarks — exactly the shape the tool exists for.

Second fixture for regression: `book mark exports/bookmarks_4_30_26.html` (Chrome, 519 bookmarks), used locally as `test/fixtures/chrome-2026-04-30.html`.

**These fixtures are real personal bookmark exports and this repo is public — they are deliberately NOT committed.** `test/fixtures/` (including the generated Chrome snapshot, which embeds the same real titles/URLs) is listed in `.gitignore`. They live only on Mike's Mac, copied in from `~/Documents/Work/BrightSite/Bookmarks Cleanup Tool/`. Tests that depend on them (`test/parser.chrome.test.js`, `test/parser.safari.test.js`, `test/exporter.test.js`'s round-trip test, `test/linkcheck.skipped.test.js`'s simulated-check test) skip with a clear message when the files are absent, so `npm test` still passes cleanly on a fresh clone.

---

## 3. Scope decisions (Mike, 6 September 2026)

1. **No date recovery.** Safari files have no dates and the tool will not try to reconstruct them from `Bookmarks.plist`. Date cutoff and age filters simply do not apply; link-check plus manual review is the whole cleanup path for Safari.
2. **Safari round-trip.** The cleaned file must import back into Safari, not only Chrome.
3. **No Reading List work.**

---

## 4. Safari's import behaviour — ANSWERED 7 September 2026

Tested on Mike's Mac with a purpose-built file carrying three top-level folders, each claiming the toolbar a different way, imported in one pass via **File > Import Browsing Data from File or Folder…**

| Folder | How it claimed the toolbar | Result |
|---|---|---|
| `Favorites` | name only, no attribute | **Landed on the Favorites bar** |
| `ZZ Attr Folder` | `PERSONAL_TOOLBAR_FOLDER="true"` only | did not |
| `ZZ Plain Folder` | neither | did not |

**Safari matches the toolbar folder by name. `PERSONAL_TOOLBAR_FOLDER` is ignored.**

Two further observations from the same import, both good news:

- Contents **merged into the existing Favorites bar** — no nested "Imported ⟨date⟩" wrapper, no duplicate Favorites folder. Round-trip is clean.
- Safari's success dialog counts folders as bookmarks (3 bookmarks + 3 folders reported as "6 bookmarks"). Cosmetic; don't use that number to verify a round-trip.

This settles section 5.2. Nothing in this spec is now unverified.

## 5. Changes, by module

### 5.0 Get the repo onto the Mac first

The app was built in Claude Cowork and pushed straight to GitHub — **there is no local clone.** The build agent needs one before it can do anything.

Clone to `~/Code/bookmarks-cleanup` — confirmed by Mike, 6 September 2026. Non-website code lives in `~/Code/`; this sits alongside `brightsite-googleads` and `budgeter`. Do not put it in `~/Sites/`.

Verified about the repo as it stands:

- Deployed files are byte-identical to HEAD — nothing has drifted.
- `package.json`: `"type": "module"`, Node >= 20, one script (`dev: wrangler pages dev`), one devDependency (`wrangler`).
- Layout: `public/` (static + `app/*.js` ES modules), `functions/api/check-links.js` (the Pages Function), `wrangler.toml`.
- `.gitignore` excludes `CLAUDE.md`, `SPEC.md`, `reference-frontend*.html`, `server.js`, `lib/`. It does not exclude `test/`.

### 5.0a Test harness — there isn't one yet

**The repo has no tests and no test runner.** `package.json` has one script (`dev: wrangler pages dev`) and one devDependency (`wrangler`). Section 6 asks for a regression test, so standing up a harness is the first piece of work, not an afterthought.

Use **Node's built-in `node:test`** (the repo already requires Node >= 20, `"type": "module"`) plus **jsdom** as the only new devDependency. No build step, consistent with the rest of the app.

**Trap — do not use `linkedom`.** It is the lighter, more obvious choice and it is silently wrong here. Measured against both fixtures: linkedom puts **zero** children in `document.body` for the Safari *and* the Chrome file — it does not do HTML tree-building for this deliberately-malformed markup, which is the exact behaviour the whole bug depends on. Tests written against it would pass or fail for reasons unrelated to the code.

**jsdom is verified correct.** Running the unmodified repo parser under jsdom reproduces real Chromium exactly on both fixtures:

| Fixture | Chromium | jsdom | linkedom |
|---|---|---|---|
| Safari | 44 parsed, no `body > dl`, 17 body children | **44, identical** | 0 body children — unusable |
| Chrome | 519 parsed, `body > dl` present | **519, identical** | 0 body children — unusable |

Wire it as `global.DOMParser = new JSDOM().window.DOMParser` before importing `parser.js`, then `node --test`. Add a `test` script to `package.json`.

### 5.0b Task 0 — establish Safari import behaviour — DONE, see section 4

Completed 7 September 2026. Answer: Safari keys off the folder name `Favorites` and ignores `PERSONAL_TOOLBAR_FOLDER`. No further manual testing needed before building 5.2.

### 5.1 `public/app/parser.js` — root discovery (the data-loss fix)

**Proven fix. I ran both variants against both fixtures in a real Chromium DOM; numbers below are measured, not predicted.**

Refactor `walkDl(dl, path, out)` to `walkNodes(children, path, out)` taking an array of sibling nodes instead of a `<DL>` element, and add root discovery:

```js
function rootNodes(doc) {
  const bodyDl = doc.querySelector('body > dl');
  if (bodyDl) return Array.from(bodyDl.children);        // Chrome, Firefox, Edge, Brave, Opera, Vivaldi, Arc, DuckDuckGo
  const hoisted = Array.from(doc.body.children)
    .filter(e => ['DT', 'DL', 'DD'].includes(e.tagName));
  if (hoisted.length) return hoisted;                    // Safari: no wrapping DL
  const any = doc.querySelector('dl');
  return any ? Array.from(any.children) : null;          // last resort
}
```

The two internal recursion points change from `walkDl(subDl, ...)` to `walkNodes(Array.from(subDl.children), ...)`. Everything else in the walk — the DT/H3/DL sibling lookahead, the Firefox `<DD>` description handling, attribute reads — stays exactly as it is. Do not rewrite the walk; it is correct.

Measured results:

- **Safari fixture: 44 → 138 bookmarks.** All 15 non-empty roots present, 0 orphans, nesting preserved (`Favorites / work / SEO` resolves correctly), source order preserved.
- **Chrome fixture (519 bookmarks): byte-identical output before and after.** Same count, same folder paths, same order — a full key-by-key comparison found zero differences. The change is purely additive.

Do not use a DOM-mutating variant (moving body children into a synthesised `<DL>`). It produces the same numbers but mutates the parsed document for no benefit.

**Also return the detected source.** `parseBookmarks` has exactly one call site (`public/app/main.js:117`), so changing its return shape is cheap:

```js
return { bookmarks, source };   // source: 'safari' | 'netscape'
```

Detect `'safari'` when there was no `body > dl` **and** no bookmark carries an `add_date`. Both conditions — a Chromium export truncated by some other tool shouldn't be mislabelled. Store `source` alongside the bookmarks in `public/app/store.js`; 5.2, 5.3 and 5.4 all read it.

### 5.2 `public/app/exporter.js` — export profiles

**Settled by Task 0 (section 4).** Current measured behaviour on the Safari fixture: all 138 links survive, but

- **no `PERSONAL_TOOLBAR_FOLDER` is emitted at all**, because the attribute is hard-coded to fire only on the literal folder name `Bookmarks Bar`;
- **root order is alphabetised**, so `Favorites` lands seventh, between `Entertainment` and `Health`. `SECTION_ORDER` only knows the three Chrome names; every Safari root scores 99 and sorts alphabetically.

Replace the two module constants with a profile chosen from `source`:

```js
const PROFILES = {
  netscape: { toolbar: 'Bookmarks Bar',
              order: ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'] },
  safari:   { toolbar: 'Favorites',
              order: ['Favorites', 'Bookmarks Menu'] },
};
```

`buildExportHtml(bookmarks, profile)` uses `profile.toolbar` for the `PERSONAL_TOOLBAR_FOLDER` test and `profile.order` for `rootSort`. Named roots first in listed order, everything else alphabetical after — the existing `rootSort` shape, just data-driven.

Default the profile to the detected source so the common case needs no user thought. Given decision 3.2 (round-trip to Safari), a Safari file in produces a Safari-profile file out.

Filename should reflect it: `bookmarks-cleaned-safari-YYYY-MM-DD.html` when the Safari profile is used, so two exports don't collide in Downloads.

No export-format picker. Task 0 confirmed name-matching works, so the detected-source default round-trips correctly with no user decision. Don't build a toggle.

Because Safari ignores `PERSONAL_TOOLBAR_FOLDER`, emitting it on `Favorites` is harmless but pointless — what matters is that the root folder is named exactly `Favorites`. Keep emitting the attribute anyway: it costs nothing and makes the same file import correctly into Chromium browsers, which do honour it.

### 5.3 Dateless files — say so, don't just hide the control

`public/app/main.js` `populateYearSelect()` already hides the whole cutoff group when nothing has a parseable date, so decision 3.1 is **already implemented** and needs no logic change. The problem is that it vanishes with no explanation — the user sees a control on Chrome files and no control on Safari files, and concludes the page is broken.

When `source === 'safari'` (or more generally when zero bookmarks have dates), replace the hidden cutoff group with one line of plain text in the same slot:

> Safari doesn't export dates, so age filtering and the year cutoff aren't available for this file. Use link-check and search instead.

Same for the Age dropdown: disable it rather than leaving it live and silently matching nothing. Its `No date` bucket would match all 138 and every other bucket zero — technically correct, practically useless.

### 5.4 UI copy

- **Footer** (`public/index.html:152`): the browser list currently ends "…and DuckDuckGo. Safari support coming later." Move Safari into the supported list and add the export path: **Safari > File > Export > Bookmarks**. Change this **only after 5.1 is verified against the fixture.**
- **"What is this?" panel:** one line noting Safari files carry no dates, so the cleanup path is link-check and manual review.
- **Empty folders** are dropped on export (measured: the empty `Brightsite` and `Tools and Reference / SEO` folders vanish). This is pre-existing behaviour for all browsers, not a Safari regression. Leave it. Mention it in the panel only if it is cheap to do so.

### 5.5 Non-HTTP schemes — optional, ask before building

**The server already handles this correctly.** Verified against the live endpoint:

```
{"url":"feed://…/hotnews.rss","status":"error","code":null,"reason":"Unsupported scheme (feed:)"}
{"url":"javascript:alert(1)","status":"error","code":null,"reason":"Unsupported scheme (javascript:)"}
```

No server change is needed. Do not touch the Pages Function.

The consequence is only cosmetic: 36 of 138 bookmarks in the Safari fixture (26%) land in the `error` bucket, which is meant for *transiently unverifiable* links the user should review. Permanently uncheckable `feed://` and `javascript:` entries drown the genuine errors.

Optional improvement, if Mike wants it: add a fifth client-side status `skipped` derived from the existing `reason` string (`/^Unsupported scheme/`), with its own filter bucket and a neutral grey badge. Client-side only, no protocol change.

**This is a judgement call, not a requirement. Ask Mike before building it.** It is not needed to ship Safari support.

---

## 6. Test plan

Automated, against both committed fixtures:

1. **Safari parse:** 138 bookmarks; 15 roots including `Favorites` and `Bookmarks Menu` (the 16th, `Brightsite`, is empty in the source and correctly contributes none); 0 orphans; `Favorites / work / SEO` present; 0 bookmarks with `add_date`; `source === 'safari'`.
2. **Chrome regression:** 519 bookmarks; output identical to pre-change, compared key-by-key on `folder_path + url + title` in order; `source === 'netscape'`. This test is the safety net for 5.1 — write it first.
3. **Safari round-trip:** parse → export → re-parse yields the same 138 bookmarks with identical folder paths.
4. **Export profile:** Safari profile names the toolbar root exactly `Favorites` (the thing Safari actually matches on), emits `PERSONAL_TOOLBAR_FOLDER="true"` on it for Chromium compatibility, and orders `Favorites`, `Bookmarks Menu`, then the rest alphabetically. Netscape profile output is unchanged from today.
5. **Dateless UI:** cutoff group hidden, explanatory line shown, Age dropdown disabled.

Manual, on Mike's Mac:

6. Repeat the import test with a real cleaned export of the full fixture: import into Safari, confirm the `Favorites` folder merges into the Favorites bar and the nested folder structure survives.
7. Link-check the Safari fixture end to end: 102 checkable URLs, 36 reported as unsupported-scheme errors, no hang, no stall.

---

## 7. Acceptance criteria

- A Safari export loads with every bookmark present, correct folder paths, and no silent loss.
- A Chrome export behaves exactly as it does today — proven by the regression test, not by eyeballing.
- The cleaned Safari file imports back into Safari with the Favorites bar intact.
- The user is told why date filtering is unavailable rather than being shown a missing control.
- The footer lists Safari only once the above holds.

---

## 8. Out of scope

- Date recovery from `Bookmarks.plist`.
- Reading List.
- iCloud-synced or iOS Safari bookmarks.
- Any server or Pages Function change.
- The pre-existing empty-folder drop.
- The `503`/`530` alive-status question for LAN-only hosts (`http://m.home/` in the Chrome fixture returns `alive` with code 530). Unrelated to Safari; log it separately if it matters.

---

## 9. Working notes for the build agent

- **Verify before you assume.** Every number in this spec came from running the real code against real files. Do the same: if a claim here doesn't reproduce, say so rather than building around it.
- **Order:** clone the repo (5.0) → test harness (5.0a) → Chrome regression test (6.2) → parser fix (5.1) → export profiles (5.2) → UI (5.3, 5.4) → footer last. Task 0 is already done.
- **Stop after each step and verify** before moving on. This is Mike's standing instruction from the original build and it is the reason the first version shipped clean.
- Vanilla JS, no framework, no build step. Match the surrounding code style; the existing modules are well-commented and the comments are accurate — keep them accurate.
- Do not remove the "Safari support coming later" footer line until the parser fix passes its test.
