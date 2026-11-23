# PhotoSite — State File

**File:** `photosite_state_20261123a.md`
**Date:** 2026-11-23
**Produced by:** Claude Code (new **Videos tab**; gear switched from spinning clips to still photos; catalogue reorg adopted).
**Supersedes:** `photosite_state_20260708b.md` (which was at v1.2.19)

> **This is the single handoff doc.** Read §1 for current status, §5 for how the project works. When you
> finish a sizeable task, write the NEW state file (protocol in §6) — don't edit this one; carry §5 forward.

---

## 1. Current status

**`dev` is at `v1.3.1` (pushed, NOT yet shipped to main).** Production is still `v1.2.19`.
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.2.19`**, CNAME intact.
- **Dev (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.3.1`.** Ahead of main by the v1.3.1
  feature commit **plus** an earlier infra commit (`a9ff33d`, catalogue gitignore/build-path).
- Nav is now **Photos · Videos · About** (3 tabs). Photos still the default landing.
- Content: 4 heroes + **55 grid items** (54 photos incl. 4 `IMG_0000` portrait + 3 `IMG_0001` landscape
  "COMING SOON" placeholders, + 1 loop tile) + **3 videos on the Videos tab**. Grid is 11 clean
  `[L P P L M]` groups (22L : 22P : 11M). Titles/specs show only in the lightbox.
- **Not yet shipped to main** — waiting on Ben's go-ahead.

---

## 2. What changed since v1.2.19 (the previous state file)

### a. Catalogue moved in-repo + protected (v1.2.19 era, infra commit `a9ff33d`)
- Ben moved the source catalogue to **`<repo>/PhotositeCatalogue/`** (~700 MB of UNWATERMARKED
  originals). It's **`.gitignore`'d** (never commit/publish it) and `build.py` resolves the source as:
  `PHOTOSITE_SOURCE` env → `<script dir>/PhotositeCatalogue` → legacy `~/Documents/PhotositeCatalogue`.

### b. ★ Videos tab + gear stills + catalogue reorg (v1.3.1)
- **New "Videos" tab.** The 3 Hi-8 clips moved OUT of the photo grid onto their own tab, rendered by the
  **same grid engine** (2-column). Build emits them in a separate **`manifest.videos`** array (never in
  `manifest.photos`). Clicking a clip opens the **fullscreen lightbox** (prev/next within the clips).
  Clips are `preload="none"` and only load/play when the Videos tab is shown (`setActiveView("videos")`).
- **Photo grid placeholders.** The 3 vacated video slots are now `IMG_0001` "COMING SOON" **landscape**
  placeholders (×3), mirroring the existing `IMG_0000` **portrait** placeholders (×4). Grid stays
  22L : 22P : 11M.
- **Gear → stills.** Dropped the **Samsung SCL810** entirely; the spinning videos are gone. The About
  "Gear" block now shows **two WebP stills** (`gear/r10.webp`, `gear/sigma.webp`) in 2 columns (stacked
  on mobile), captions kept. Gear stills are processed to WebP (resized, **NOT watermarked** — product
  shots). Old `gear/spinning_*.mp4` removed from the site.
- **Catalogue reorg adopted:** Ben split `about/gear/` into `gearPhotos/` + `gearVideos/`; tapes moved
  `photos/landscape/tapes/` → **`media/videos/`** (so `photos/` is photos only); `IMG_0001` moved out of
  `landscape/archive/` → `landscape/` (archive is skipped by the index, so a placeholder can't live
  there). `gearVideos/` kept in the catalogue as Ben's backup (gitignored; can be deleted to save space).
- **About text:** Ben re-pasted it but it was **identical to what was already live** — no change.

---

## 3. Open items / known issues

- **BUILD ENV (important):** as of 2026-11-23 the machine's Python (3.14, `AppData\Local\Python`) had
  **no Pillow** and **no ffmpeg** on PATH, no venv. Pillow was `pip install`ed this session (image regen
  works). **ffmpeg is still absent → videos CANNOT be re-encoded here.** The 3 tape clips are already
  built + watermarked in `videos/`; to rebuild without clobbering them, `touch videos/*.mp4` first so the
  mtime check skips the transcode (otherwise `process_video` falls back to a RAW `shutil.copy2` and loses
  the watermark). If a video ever needs re-encoding/new watermark, install ffmpeg first. After any
  rebuild, confirm `git status videos/` is clean.
- **Placeholders:** 4 `IMG_0000` (portrait) + 3 `IMG_0001` (landscape) "COMING SOON" tiles are in the
  grid. Replace with real photos when ready (drop in `media/photos/{portrait,landscape}/`, swap the
  placeholder lines in layout.txt for real ids, rebuild).
- Custom zoom viewer + hero slide are **touch-gesture features unverifiable by the preview** — dialed in
  by Ben on an iPhone. Any change to lightbox/hero touch code needs manual phone verification.
- The re-interleave assumes every group is `[L P P L M]` (2:2:1).
- Gear framing: `r10` (1280×1051) and `sigma` (1000×1000 square) are normalised by **height**
  (`max-height`) so they balance; the lens looks a bit smaller because it sits in a square frame with
  padding. Source-image framing, not a CSS bug.
- **Preview gotcha:** the grid builds in `requestAnimationFrame`, throttled in a backgrounded tab. For a
  real render, use a **foreground** preview. Verify counts/structure via DOM/JS eval (screenshots of 50+
  WebP can mislead — dark-on-white products look "blank" when downscaled; zoom to confirm).

---

## 4. Next steps (none pending; ideas)

1. **Ship v1.3.1 to main** when Ben gives the word (`git checkout main && git merge dev`, verify CNAME,
   push). This also carries the earlier infra commit `a9ff33d`.
2. Replace the `IMG_0000`/`IMG_0001` placeholders with real photos.
3. (Optional) install ffmpeg so videos can be re-encoded (e.g. if a new clip is added).

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version + `?v=`
on `index.html`'s asset links on every CSS/JS/manifest change. **Ben is fine with the live preview
panel — use it whenever it helps verify.**

---

## 5. How the project works (architecture, pipeline, gotchas)

*The code is the ultimate source of truth; this is the curated map + the non-obvious bits.*

**Shape.** A **static** site — plain HTML/CSS/vanilla JS, no framework, no bundler, no server.
`build.py` is the only "backend": it turns source photos into web assets + a manifest the page reads.
Everything must keep working when `index.html` is opened directly via `file://`.
- **`manifest.js`, not `.json`** — browsers block `fetch()` over `file://`, so the manifest is a JS file
  assigning `window.PHOTOSITE_MANIFEST = {…}`, loaded via a plain `<script>` tag.
- Keep this model — no framework / server rewrite without explicit say-so. Local testing = open
  `index.html` (or a static server for the preview pane).

**Files.** `index.html` (shell: top bar with **3 tabs** [pics/videos/about], hero, `#grid`, **`#view-videos`
with `#grid-videos`**, About incl. gear `<img>`s, footer, lightbox markup; `viewport-fit=cover`;
self-hosted font preload; loads manifest.js then script.js) · `styles.css` (all styling; `@font-face`
self-hosted DM Sans 400/500; `:root` var theming; mobile media query at `max-width:700px`;
`env(safe-area-inset-*)` on fixed bars; `html { scrollbar-gutter: stable }`; `.gear-photo` stills) ·
`script.js` (one IIFE). `manifest.js` + `thumbnails/ photos/ videos/ gear/` are **generated — never
hand-edit**. `fonts/` (2 woff2) and `PhotositeCatalogue/` (gitignored source) also live in the repo.

**script.js rendering (two grids now).** `renderGridInto(list, gridEl, lbList, offset)` is the shared
engine; `renderPhotos()` paints `#grid` from `allItems` (= `manifest.photos`, photos + loop) and
`renderVideos()` paints `#grid-videos` from `videoItems` (= `manifest.videos`). Each tile's click calls
`openFrom(lbList, index)`, which sets the active lightbox list (`items`) to that grid's set before
opening — so Photos (heroes + photos) and Videos (clips) navigate independently. `onResize` re-renders
both. `setActiveView` toggles `.view`/nav and plays/pauses `#grid-videos video` (they're `preload=none`,
so this is also when they first download). Loop timers are cleared only in `renderPhotos`.

**Build pipeline (`build.py`; needs Pillow + ffmpeg).** Reads the catalogue → regenerates `thumbnails/`
(≤1200px, q82), `photos/` (≤2400px, q88) **as WebP** (`IMAGE_EXT`, `_save_image()`), `videos/` (libx264
crf23 `-preset slow` `+faststart` — only re-encodes when the source is newer than the output), `gear/`
(stills under the gear folder → WebP `GEAR_LONG_EDGE`/`GEAR_QUALITY`, unwatermarked), and `manifest.js`
(`heroes`, `photos`, **`videos`**); then prunes stale/old-format outputs. Per photo: EXIF, auto-orient,
resize (LANCZOS), bake a visible **© watermark + EXIF Copyright/Artist**, content-hash `?v=`. Manifest
per-photo `exif` is only aperture/iso/shutter/focal. Parallelized; manifest order is authoritative.
- **Source**: `PhotositeCatalogue/` (see §2a for resolution order). Sidecars: `titles.json`,
  `exif_overrides.json`.
- **layout.txt**: BUCKETED BY TYPE then re-interleaved. Blocks: heroes → landscape-like (small
  landscapes + loop) → portraits → mediums → **videos (own tab)**. Build rebuilds the `[L P P L M]`
  groups (`group g = land[2g], port[2g], port[2g+1], land[2g+1], med[g]`). Videos take no role tag
  (detected by extension) and are routed to `manifest.videos`, NOT the grid.
- **Reserved media subfolder names (any depth):** `archive` (hidden — a placeholder can't live here),
  `loop` (cycling tile), `gear` (About stills). `_find_media_subdir(name)` locates loop/gear anywhere.
- **Edit-suffix rule:** `_canonical_stem()` strips `_DxO…` and trailing `-<n>` → bare `IMG_NNNN`.

**Rendering & lightbox.** One masonry engine, 2 columns, `grid-auto-rows:1px`, vertical reserve =
column gap (equal gutters). Grid must render at the FINAL viewport width (`scrollbar-gutter: stable`
guarantees it). No captions in the grid/hero — titles/specs live only in the lightbox. Hero:
auto-advance cross-fades, mobile drag slides (Instagram-style), desktop hover-swell; slides 2–4 load
lazily via `ensureHeroLoaded()`. Lightbox: videos muted + captioned "Hi-8"; photos/loop show title +
specs; custom pinch-zoom/pan/tap-reset/double-tap on touch (`Z_MAX=6`). Videos carry a content-hash
`?v=`; the static host ignores the query string, so a stale hash still serves the file.

**Deploy.** dev → Cloudflare Pages (dev.bendentremont.com); main → GitHub Pages (bendentremont.com).
**Deploy is a merge, not fast-forward**; `CNAME` (=bendentremont.com) lives **only on `main`** — always
`cat CNAME` after merging, before pushing. Bump footer version + `?v=` on index.html asset links on
every CSS/JS/manifest change.

**Performance posture.** Stills WebP; fonts self-hosted (400/500); hero slides 2–4 deferred; Videos-tab
clips `preload="none"` (load on tab open); gear now lightweight WebP stills (12 MB of spinning clips
removed from the deploy). Ben has **declined any change that reduces image/video quality** (srcset/
smaller thumbs, higher CRF, lower resolution, AVIF) — off-limits without a fresh ask.

**Aesthetic.** "Ben's Place" — minimalist, VSCO-inspired, wildlife/nature. Restraint, white space, photos
do the talking. Preserve the static/no-framework/`build.py`/`file://` model and the watermark +
EXIF-copyright protection on derivatives.

---

## 6. State-file protocol

- Files live in `state/`, named `photosite_state_YYYYMMDD<letter>.md` (letter increments within a day).
  **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones. **Carry §5 forward** (lightly updated) so the architecture context rides with the latest file.
