# PhotoSite — State File

**File:** `photosite_state_20260702a.md`
**Date:** 2026-07-02
**Produced by:** Claude Code (video-seam fix → Lightroom migration → 2-column WYSIWYG rebuild → loop tile → custom pinch-zoom viewer → catalogue restructure).
**Supersedes:** `photosite_state_20260620d.md` (which was at v1.1.47)

> **This is the single handoff doc.** (`CLAUDE_CODE_BRIEF.md` was retired 2026-07-02 — it had
> gone stale describing the old 3-column engine; its durable architecture/pipeline notes now live
> in §5 below, and the code is the ultimate source of truth.) Read §1 for current status, §5 for
> how the project works. When you finish a sizeable task, write the next state file (protocol in
> §6) — don't edit this one; carry §5 forward into it.

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
- Loop lightbox cycles with **instant** swaps regardless of the tile's fade (fine now that fade=0).
- Custom zoom viewer is **unverified by automated tooling** (no multi-touch in the preview) — it was
  dialed in by the owner testing on an iPhone. Any future change to lightbox touch code needs the
  same manual verification.

---

## 4. Next steps (none pending; ideas)

1. Replace the 4 `IMG_0000` placeholders with real portraits (drop in `media/portrait/`, swap the
   layout.txt lines, rebuild).
2. (Optional) Cache-bust the gear clips (currently plain-copied, no `?v=`) if a gear clip is ever
   re-rendered and the CDN serves it stale.

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version +
`?v=` on `index.html`'s asset links on every CSS/JS/manifest change.

---

## 5. How the project works (architecture, pipeline, gotchas)

*Absorbed from the retired onboarding brief. The code is the ultimate source of truth; this is the
curated map + the non-obvious bits worth not re-deriving.*

**Shape.** A **static** site — plain HTML/CSS/vanilla JS, no framework, no bundler, no server.
`build.py` is the only "backend": it turns source photos into web assets + a manifest the page reads.
Everything must keep working when `index.html` is opened directly via `file://`.
- **`manifest.js`, not `.json`** — browsers block `fetch()` over `file://`, so the manifest is a JS
  file assigning `window.PHOTOSITE_MANIFEST = {…}`, loaded via a plain `<script>` tag.
- Keep this model — no framework / server-rendered rewrite without explicit say-so.
- **Local testing = open `index.html`** in a browser (no server needed).

**Files.** `index.html` (shell: top bar, hero, empty `#grid` JS fills, About, footer, lightbox
markup; loads manifest.js then script.js) · `styles.css` (all styling, VSCO-inspired; `:root` var
theming, mobile media query at `max-width:700px`) · `script.js` (one IIFE: view switching — **always
opens on Photos**; hero slideshow; the unified `renderGrid`; the lightbox). `manifest.js` +
`thumbnails/ photos/ videos/ gear/` are **generated — never hand-edit**.

**Build pipeline (`build.py`; needs Pillow + ffmpeg).** Reads the off-repo catalogue → regenerates
`thumbnails/` (≤1200px long edge, q82), `photos/` (≤2400px, q88), `videos/` (libx264 crf23,
`+faststart`), `gear/` (verbatim copy), and `manifest.js`; then **prunes stale** outputs whose
source is gone. Per image: read EXIF, auto-orient, resize (LANCZOS), bake a visible **© watermark +
EXIF Copyright/Artist** into every derivative, write progressive JPEGs with a content-hash `?v=`.
Videos re-encode only when the source is newer (watermark baked via ffmpeg `drawtext`). Parallelized;
manifest order is authoritative (no mtime sort).
- **Source folder**: `~/Documents/PhotositeCatalogue/` (override with `PHOTOSITE_SOURCE`). **Not in
  the repo, not present in every environment** — if you can't see it, that's expected; you can still
  edit site code, just can't run a full build.
- **Sidecars**: `titles.json` (id→title, auto-created empty, falls back to EXIF ImageDescription);
  `exif_overrides.json` (fills spec fields a cropped export dropped; never clobbers real EXIF).
- Key constants (top of build.py): `THUMB_LONG_EDGE=1200`, `FULL_LONG_EDGE=2400`, `THUMB_QUALITY=82`,
  `FULL_QUALITY=88`, `ADD_WATERMARK`, `WATERMARK_OPACITY`, plus the `VIDEO_*` / `LOOP_*` / render
  constants in §2.

**Catalogue & layout.**
- **Catalogue = single source of truth**, `~/Documents/PhotositeCatalogue/`: `media/` (subfoldered:
  landscape, portrait, tapes, loop, gear, archive) + `layout.txt` + `titles.json` + `exif_overrides.json`.
- **layout.txt is WYSIWYG** — one line per grid item, top-to-bottom, `<id> <role>` (roles: hero,
  medium, "small landscape", "small portrait"; videos/`loop` take no role). Reorder by moving lines;
  build warns if a role tag contradicts the image's real orientation.
- **Special media subfolder names**: `archive` (hidden), `loop` (cycling tile), `gear` (copied to the
  About page). Any other subfolder (`tapes`, `landscape`, `portrait`, …) is pure organization.
- **Edit-suffix rule**: `_canonical_stem()` strips `_DxO…` and a trailing `-<n>` → bare `IMG_NNNN`,
  so re-edits (`-2`, `-3`) need no layout.txt change. All derivatives carry a content-hash `?v=`.

**Rendering & lightbox.**
- **One renderer, two views**: `renderGrid` renders 2-column from `layout.txt` order on desktop AND
  mobile — they can't drift (see §2c).
- **Lightbox** = `[heroes…, grid…]`: heroes clickable (items 0–3), bounded nav (no wrap). Videos
  muted, captioned "Hi-8". Loop item cycles full-res. **Custom pinch-zoom/pan/tap-reset/double-tap on
  mobile** (§2e); desktop uses mouse (click-outside closes, arrows, keyboard).

**Deploy.** dev → Cloudflare Pages (dev.bendentremont.com); main → GitHub Pages (bendentremont.com).
**Deploy is a merge, not fast-forward** (dev/main diverged); `CNAME` (=bendentremont.com) lives **only
on `main`** — always `cat CNAME` after merging, before pushing. Bump footer version + `?v=` on
index.html asset links on every CSS/JS/manifest change. (Also in Claude Code memory.)

**Aesthetic.** "Ben's Place" — minimalist, VSCO-inspired, wildlife/nature. North star: restraint,
white space, photos do the talking. Preserve the static/no-framework/`build.py`/`file://` model and
the watermark + EXIF-copyright protection on derivatives.

---

## 6. State-file protocol

- Files live in `state/`, named `photosite_state_YYYYMMDD<letter>.md` (letter increments within a
  day: a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly
  updated) so the architecture context always rides with the latest file.
