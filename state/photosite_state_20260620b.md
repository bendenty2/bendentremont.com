# PhotoSite — State File

**File:** `photosite_state_20260620b.md`
**Date:** 2026-06-20
**Produced by:** Claude Code (session: lightbox/video/footer fixes, then the layout.txt
authoring system + catalogue consolidation + dead-code/dev-tuner removal).
**Supersedes:** `photosite_state_20260620a.md`

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture (updated this session), then
> use this file for current status and next steps. When you finish a sizeable task, write the
> next state file — don't edit this one.

---

## 1. Current status

- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.1.30`**, commit
  `3052687`, working tree clean.
- **Production (`main` → GitHub Pages → bendentremont.com): `v1.1.28`**, commit `d570e67`.
  **`dev` is ahead of `main`** — everything below is on `dev`, awaiting the owner's go-ahead to
  merge to `main`. (CNAME on `main` = bendentremont.com; see the deploy note in §5.)
- Content unchanged: 4 heroes + 49 grid items (14 medium / 14 portrait / 18 landscape /
  3 video). All grid photos are exactly 3:2 or 2:3.

---

## 2. What changed since the previous state file (20260620a was at v1.1.28)

### A. New catalogue/authoring model — `layout.txt` + a single `media/` pool
The old `large_photos/` + `tiles/tileN/<named slots>` scheme is **gone**. The catalogue
(`~/Documents/PhotositeCatalogue/`) is now just:
- **`media/`** — one flat pool of every image and video (53 files: 49 grid + 4 heroes).
- **`layout.txt`** — the whole page top-to-bottom, one item per line: `<filename> <role>`.
  Roles: `hero` (slideshow, listed first), `medium` (span-2 grid tile), `small landscape` /
  `small portrait` (half-width tiles). Videos take no role (by extension). Extension optional;
  `#`/blank lines ignored. Reorder = move lines; add = drop file in `media/` + add a line.
- `titles.json`, `gear/` unchanged.

`build.py` was rewritten to read this (`_read_layout`, `_resolve_source`) instead of walking
tiles. **All output verified byte-identical** to the tile-based build at every step (heroes +
photos arrays unchanged; only `generated_at` differs, which is reverted on commit).

- **`hero` and `medium` are the real levers** (they change build behavior: slideshow
  selection/order, span-2). `small landscape`/`small portrait` is descriptive — the grid still
  renders by the image's real dimensions — but **`build.py` now warns** when a tag contradicts
  the actual orientation (typo catcher). Verified: 0 false positives on current tags; fires on
  a forced mismatch.
- **Consolidation:** heroes moved into the pool, `grid/` renamed `media/`, completeness
  verified file-by-file, then **`tiles/` and `large_photos/` deleted** (Windows blocked the
  empty-dir removal mid-run; finished with PowerShell `Remove-Item -Recurse -Force`).
- **Dead code removed from `build.py`:** the tiles fallback, `NV_SLOTS`/`V_SLOTS`, `_tile_num`,
  `_get_sorted_tile_dirs`, `_pick_file`, `_scan_photos`, and the large_photos hero scan.
  `build.py` is now purely `layout.txt`-driven (errors if `layout.txt` is absent — no
  fallback).

### B. Dev/RECORD layout tuner — fully removed
The DEV button + RECORD clipboard tool were already gone from a prior session; the last
remnant was the empty **`SEQUENCE_PADDING`** override array + its branch in `script.js`.
Removed both. Since it was empty, the desktop layout math is byte-for-byte unchanged
(production `TILE_PADDING` fractions untouched). `seqIdx` stays — it's the tile index passed to
`buildTile`. (`dev-layout.html` is a separate git-ignored scratchpad; left as-is.)

### C. Site behavior fixes (v1.1.29)
- **Videos have no audio** anywhere. Removed the lightbox unmute/mute toggle (button + JS
  handler + CSS); lightbox video is `muted`.
- **Lightbox prev/next now work over a video.** Root cause was paint order: the video wrapper
  (a positioned descendant later in the DOM) painted above the nav buttons, while photos sit
  in-flow below. Fix: `z-index: 2` on `.lightbox-nav` and `.lightbox-close`.
- **Always opens on the Photos view** — removed the localStorage "remember last tab" logic.
- **Footer** version + copyright nudged inward (`clamp(18px, 5vw, 64px)`) — scales on desktop,
  slight on phones to avoid collision.

### D. Docs
`CLAUDE_CODE_BRIEF.md` updated this session: source diagram + §4 (media/ + layout.txt + roles
+ mismatch warning), §5 (notes the desktop pattern engine is desktop-only and `renderGridMobile`
handles ≤700px), §6 (dev tuner marked removed), and the file-inventory dev-mode/audio mentions.

---

## 3. Open items / known issues

- **`dev` is ahead of `main`** (v1.1.30 vs v1.1.28). Publish with `git checkout main && git
  merge dev` once the owner approves — **verify `cat CNAME` survives before pushing** (see §5).
- **`small landscape`/`small portrait` tags are descriptive, not authoritative** — the grid
  buckets by real image dimensions. A mistag won't break layout; `build.py` just warns. If the
  owner ever wants a tag to *force* a bucket against the image's shape, that needs a manifest
  field + renderer support (not built).
- **Desktop video order** still follows manifest/layout order but isn't separately tunable from
  mobile (both read the same `layout.txt` order). Fine today.
- **Possible next feature:** a drag-and-drop visual layout editor that reads/writes
  `layout.txt` (discussed; deferred — the text file is the data model either way).
- Catalogue (`media/`, `layout.txt`) is off-repo and not in every environment — a full
  `build.py` run needs it.

---

## 4. Next steps

1. Owner reviews `dev`; on approval, merge `dev` → `main` to publish v1.1.30 (CNAME check!).
2. Optional: build the visual `layout.txt` editor; optional: consolidate further if desired.
3. Continue content/layout curation via `layout.txt` + `python build.py`.

Reminder: develop on `dev`, merge to `main` to publish. **Mobile and desktop layout engines
are separate — never let a change to one affect the other.** Bump the footer version + `?v=` on
`styles.css`/`script.js` on every CSS/JS change (Cloudflare caches assets 4h).

---

## 5. Context worth keeping

- **Authoring:** `media/` (flat pool) + `layout.txt` (ordered, role-tagged) is the single
  source of page order. `build.py` resolves filenames from `media/` (extension optional).
- **Two separate render paths:** desktop = the 7-item `[M,H,F,F,H,M,H]` pattern engine; mobile
  (≤700px) = `renderGridMobile` (2-column, native 3:2/2:3, interlock blocks, px spacing knobs
  `CAP_OFFSET`/`TILE_GAP` over 1px `grid-auto-rows`). `renderGrid` branches to mobile at the
  top. Desktop look is hand-tuned and must stay untouched by mobile work.
- **Deploy is a MERGE, not fast-forward** — `dev`/`main` diverged; **`CNAME`
  (bendentremont.com) lives only on `main`** (`dev` never has it). `git merge dev` preserves it
  via 3-way merge, but **always `cat CNAME` after merging, before pushing.** Pages live ~60s
  after push. (Also in Claude Code memory `dev-preview-hosting`.)
- **Cache-busting:** `?v=<version>` on the `<link>`/`<script>` in `index.html`, bumped with the
  footer version, every CSS/JS change. Cloudflare ignores `_headers` Cache-Control for assets.
- **Why `manifest.js` not `.json`:** `fetch()` blocked over `file://`; a JS global keeps the
  site openable as a local file.
- **Two GitHub accounts on this machine:** `bendenty2` (this repo) vs `aiceinc` (separate
  project). Per-repo credential isolation via local `useHttpPath` — never set globally.
- **Brand/voice:** "Ben's Place"; minimalist, VSCO-inspired, wildlife/nature; humble-gear,
  patient-observation tone in About.
