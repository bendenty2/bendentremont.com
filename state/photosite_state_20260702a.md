# PhotoSite — State File

**File:** `photosite_state_20260702a.md`
**Date:** 2026-07-02
**Produced by:** Claude Code (video-seam fix → Lightroom migration → 2-column WYSIWYG rebuild → loop tile → custom pinch-zoom viewer → catalogue restructure).
**Supersedes:** `photosite_state_20260620d.md` (which was at v1.1.47)

> New session: read `CLAUDE_CODE_BRIEF.md` for architecture, then this file for current status.
> **⚠️ The brief is now STALE on the grid engine** (it still describes the old 3-column
> pattern layout + a separate `renderGridMobile`). Both are gone — see §2/§5. The brief
> needs a refresh; treat this state file as authoritative where they disagree.
> When you finish a sizeable task, write the next state file — don't edit this one.

---

## 1. Current status

**Everything is shipped to production; dev and main are in sync at `v1.1.80`.**
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.1.80`**, merge commit
  `3cb5a76`. CNAME (`bendentremont.com`) intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.1.80`**, commit `7805615`.
  (This state file is committed on `dev` after the deploy; it rides the next merge.)
- Content: **4 heroes + 55 grid items** = 51 grid photos (incl. **4 `IMG_0000` portrait
  placeholders**) + 1 loop tile (8 frames) + 3 videos. Grid is **11 clean 5-item groups**.

---

## 2. What changed since v1.1.47 (the big arc)

### a. Video tiles — the black-bar/seam saga (≈v1.1.50–60)
- Hi-8 clips (1920×1080, ~15% pillarbox each side) are **cropped in build.py** to remove the
  bars: `VIDEO_CROP = "1344:1080:290:0"` (a few px past the content edge so no sliver survives),
  kept full height. Displayed in 3:2 tiles via **`object-fit: fill`** (stretches, never clips →
  no sub-pixel seam). CSS: `.tile--video .video-crop-wrapper video { position:absolute; inset:0;
  object-fit:fill }`.
- Baked © watermark shifted right to match the stills' margin: **`VIDEO_WM_RIGHT = 13`** (was 48).
- Grid bottom-row medium alignment nudged to sub-pixel (that was the old 3-col engine, now gone).

### b. Lightroom edit migration (v1.1.61)
- All stills re-edited in **Lightroom**, suffixed **`-1`** (was DxO `_DxO`). `_canonical_stem()`
  now strips **both** a trailing `-<n>` **and** `_DxO…` → bare `IMG_NNNN`. layout.txt uses **bare
  IDs**; re-editing to `-2`, `-3`… needs no layout.txt change.

### c. ★ Unified 2-column WYSIWYG grid (v1.1.66) — the core rewrite
- **Deleted** the entire 3-column pattern engine (`getColumnCount`, the U-unit pattern,
  `TILE_PADDING`, `GROUP_END_TRIM`, `tileRowSpan`) **and** the separate `renderGridMobile`.
- **One** `renderGrid(list)` now used on every screen. It emits tiles **in `layout.txt` order**
  (no re-bucketing) across **2 columns**, packed by `grid-auto-flow: row dense`:
  medium = full-width band (span 2); portrait = tall (2:3); landscape/video/loop = short (3:2).
  `[L,P,P,L]` blocks interlock to equal height, medium drops in beneath.
- **layout.txt is now truly WYSIWYG**: move a line → move a photo; desktop & mobile identical.
- CSS: `.grid { grid-template-columns: repeat(var(--cols,2), minmax(0,1fr)); grid-auto-rows: 1px }`.
  Row-span = `ceil(imgH + reserve)`; `RESERVE_DESKTOP = 34`, `RESERVE_MOBILE = 21` (same reserve
  on every tile is what balances the two columns).
- layout.txt reorganised into **5-item `L P P L M` groups**; a video or the loop can take a
  landscape slot (e.g. a group's top-left).

### d. Loop tile (v1.1.67+)
- A **`loop`** line in layout.txt points at **`media/loop/`**; its images share one grid tile and
  reveal one at a time, ascending + wrapping. build.py `process_loop()` resizes/watermarks each
  frame into `photos/loop/` + `thumbnails/loop/` and emits one `{type:"loop", frames:[…],
  intervalMs, fadeMs, span, width, height}` manifest item.
- Renderer `buildLoopTile()` = two stacked `.loop-frame` layers that cross-fade (incoming fades in
  on top, outgoing hidden once covered). Lightbox cycles the full-res frames too.
- **Current settings: `LOOP_INTERVAL_MS = 500`, `LOOP_FADE_MS = 0`** (instant switches).

### e. ★ Custom pinch-zoom photo viewer (v1.1.72–75) — mobile only
- The lightbox **owns its zoom** via a CSS transform on `#lightbox-img` (not the browser's native
  page zoom, which can't be reset via JS on iOS). `touch-action: none` on `.lightbox` stops native
  gestures. Every touch handler bails above 700px, so **desktop (mouse) is untouched**.
- Gestures: **pinch** to zoom (focal-anchored, cap **`Z_MAX = 6`**), **drag when zoomed** to pan on
  a static backdrop (bounded to the image edges), **single tap when zoomed** → reset to 100%,
  **double-tap at 100%** → zoom in toward the tap point (`DOUBLE_TAP_ZOOM = 2.5`), **swipe at 100%**
  → change photo. Zoom resets on every photo change + close.

### f. Media catalogue restructure (v1.1.80)
- `media/` is now **all subfolders, no loose files**. The media index **recurses** into subfolders
  so layout.txt bare IDs resolve wherever a file lives. `SKIP_SUBDIRS = {"archive", "gear", "loop"}`.
  - `landscape/`, `portrait/` — the grid stills (organizational; transparent to the build).
  - `tapes/` — the 3 Hi-8 videos.
  - `loop/` — the 8 loop frames (handled by `process_loop`, skipped from the index).
  - `archive/` — photos deliberately **not displayed** (skipped from the index).
  - `gear/` — the 3 spinning-gear clips; build **copies `media/gear/*` → `site/gear/`** (the About
    page references `gear/…` directly). Skipped from the photo index.

### g. Hover + hero polish
- Grid/video hover: **swell (`scale(1.012)`) kept, opacity fade removed**. Hero images now swell on
  hover too (`.hero-slideshow:hover .hero-img.is-active`).
- Hero **EXIF caption moved above the dots** (was below).

### h. Placeholders
- `IMG_0000` (portrait) + `IMG_0001` (landscape) added as **placeholders**. `IMG_0000` is used
  **4×** in layout.txt (groups 10–11) — the build renders each occurrence as its own tile.
  `IMG_0001` is currently spare/unused.

---

## 3. Open items / known issues

- **4 `IMG_0000` portrait placeholders** still in the grid (groups 10–11). Replace with real
  portraits as they're shot — each group wants 2 portraits.
- `IMG_0001` (landscape placeholder) and `IMG_0782` sit in top-level… actually in `media/…` but are
  **not referenced in layout.txt**, so they don't display. Harmless (the drop-check flags them).
- **`CLAUDE_CODE_BRIEF.md` is stale** on the grid engine (describes the removed 3-col pattern +
  `renderGridMobile`). Worth a refresh so new sessions aren't misled.
- Loop lightbox cycles with **instant** swaps regardless of the tile's fade (fine now that fade=0).
- Custom zoom viewer is **unverified by automated tooling** (no multi-touch in the preview) — it was
  dialed in by the owner testing on an iPhone. Any future change to lightbox touch code needs the
  same manual verification.

---

## 4. Next steps (none pending; ideas)

1. Replace the 4 `IMG_0000` placeholders with real portraits (drop in `media/portrait/`, swap the
   layout.txt lines, rebuild).
2. Refresh `CLAUDE_CODE_BRIEF.md` §grid-engine to describe the unified 2-column WYSIWYG renderer.
3. (Optional) Cache-bust the gear clips (currently plain-copied, no `?v=`) if a gear clip is ever
   re-rendered and the CDN serves it stale.

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version +
`?v=` on `index.html`'s asset links on every CSS/JS/manifest change.

---

## 5. Context worth keeping

- **Catalogue = the single source of truth**, all under `~/Documents/PhotositeCatalogue/`:
  `media/` (subfoldered pool: landscape, portrait, tapes, loop, gear, archive) + `layout.txt`
  (page order/roles, bare IDs) + `titles.json` + `exif_overrides.json`. `build.py` reads these and
  writes `thumbnails/ photos/ videos/ gear/ manifest.js` into the site dir.
- **layout.txt is WYSIWYG** — one line per grid item, top-to-bottom, `<id> <role>` (roles: hero,
  medium, "small landscape", "small portrait"; videos/`loop` take no role). Reorder by moving lines.
- **Special media subfolder names**: `archive` (hidden), `loop` (cycling tile), `gear` (copied to
  About page). Any other subfolder (e.g. `tapes`, `landscape`, `portrait`) is pure organization.
- **One renderer, two views**: `renderGrid` renders 2-column from `layout.txt` order on desktop AND
  mobile — they can't drift. Mobile changes and desktop changes are the same code now.
- **Lightbox** = `[heroes…, grid…]`: heroes clickable (items 0–3), bounded nav (no wrap). Videos
  muted, captioned "Hi-8". Loop item cycles full-res. **Custom pinch-zoom/pan/tap-reset/double-tap
  on mobile** (see §2e) — desktop uses mouse (click-outside closes, arrows, keyboard).
- **Deploy is a merge, not a fast-forward** (dev/main diverged); `CNAME` is **only on `main`** —
  always `cat CNAME` after merging, before pushing. (Also in Claude Code memory.)
- **Edit-suffix rule**: `_canonical_stem()` strips `_DxO…` and a trailing `-<n>` → bare `IMG_NNNN`.
  Photos + videos + loop frames all carry a content-hash `?v=` for cache-busting.
- Brand/voice: "Ben's Place"; minimalist, VSCO-inspired, wildlife/nature.
