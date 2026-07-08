# PhotoSite — State File

**File:** `photosite_state_20260707a.md`
**Date:** 2026-07-07
**Produced by:** Claude Code (mobile-landscape safe-area + gestures, desktop/video hover swell, captions moved to the lightbox only, hero manual-swipe slide, equal grid gutters, mobile hero/divider/dots polish).
**Supersedes:** `photosite_state_20260702b.md` (which was at v1.2.1)

> **This is the single handoff doc.** (`CLAUDE_CODE_BRIEF.md` was retired 2026-07-02; its durable
> architecture/pipeline notes live in §5, and the code is the ultimate source of truth.) Read §1 for
> current status, §5 for how the project works. When you finish a sizeable task, write the next state
> file (protocol in §6) — don't edit this one; carry §5 forward into it.

---

## 1. Current status

**Shipped to production; dev and main are in sync at `v1.2.8`.**
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.2.8`**, CNAME intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.2.8`.** (This state file is
  committed on `dev` and rides the merge that ships it.)
- Content: **4 heroes + 55 grid items** = 51 grid photos (incl. **4 `IMG_0000` portrait
  placeholders**, now titled "COMING SOON") + 1 loop tile (8 frames) + 3 videos. Grid is **11 clean
  5-item groups**. **Titles/specs no longer show in the grid or hero — only in the lightbox.**

---

## 2. What changed since v1.2.1 (the previous state file)

### a. Mobile-landscape fixes (v1.2.2)
- **Edge-to-edge top bar/footer on notched phones.** Added `viewport-fit=cover` + `env(safe-area-
  inset-*)` padding so the black bars fill the safe-area margins (no white gaps in landscape) while
  content stays clear of the notch/Dynamic Island/home-indicator. `env()` = 0 on desktop (no-op).
- **Lightbox gestures work in landscape.** The touch handlers no longer bail above 700px — an iPhone
  in landscape is ~874px wide, so it was being treated as desktop. Touch events only fire on touch
  devices, so desktop mouse is unaffected.
- **Desktop hero hover swell.** Dropped the `overflow:hidden` clip on `.hero-slideshow` so the hero
  photo physically grows on hover like the grid tiles (mobile clips it again — see §2d).

### b. Titles refresh (v1.2.3)
- Applied an updated `titles.json` (14 titles; placeholders → "COMING SOON").

### c. ★ Captions moved to the lightbox only (v1.2.4 → v1.2.5)
- Briefly (v1.2.4) grid captions showed **title-left / specs-right**; then (v1.2.5) **titles + specs
  were removed from the grid AND the hero entirely** — they appear **only in the lightbox** now
  ("photos speak for themselves"). Removed the hero `#hero-exif` element + `updateHeroExif`, the grid
  tile caption builders, and all caption CSS. `captionText()` is kept (lightbox uses it).

### d. Hero manual-swipe = slide on mobile (v1.2.4)
- Mobile hero: a manual horizontal drag is now an **Instagram-style live slide** (neighbours peek in
  mid-drag, snaps to next/prev on release, wraps). **Auto-advance still cross-fades** — only the manual
  gesture slides. Clipped to the frame on mobile (`.hero-slideshow { overflow:hidden }` in the mobile
  query); desktop keeps `overflow:visible` for the swell. Lives in `buildHeroSlideshow`
  (touchstart / touchmove `passive:false` / touchend + `finishHeroSlide`).

### e. Equal grid gutters + video frame swell (v1.2.6)
- **Vertical tile gap now = the column gap** (`reserve = colGap` in `renderGrid`), so gutters are equal
  horizontally and vertically at any width. Replaced the fixed `RESERVE_DESKTOP/MOBILE` (which also
  went away when captions were removed).
- **Video tiles swell the frame** on hover: `.video-crop-wrapper` `overflow: clip → visible`, matching
  the photos/hero (video fills the wrapper exactly at rest, so nothing spills until hover).

### f. Mobile hero/divider/dots polish (v1.2.7 → v1.2.8)
- **Hero divider** (`#view-pics .section-divider`, mobile): pulled in to 10px from the screen edges
  (a touch longer than the hero photo, not edge-to-edge) and closer to the grid. The divider↔grid gap
  is now ~12px (note: those margins **collapse**, so the gap is the *larger* of divider-bottom /
  grid-top, not the sum).
- **Nav dots**: 7px (default), with 16px spacing above and below.

---

## 3. Open items / known issues

- **4 `IMG_0000` portrait placeholders** still in the grid (last two groups), titled "COMING SOON".
  Replace with real portraits — drop in `media/portrait/`, swap the lines in the **portrait block** of
  layout.txt, rebuild.
- Custom zoom viewer + hero slide are **touch-gesture features unverifiable by the preview** (no
  multi-touch / drag simulation) — dialed in by the owner on an iPhone. Any change to lightbox or hero
  touch code needs manual phone verification.
- The re-interleave assumes every group is `[L P P L M]` (2:2:1). A different group shape would need
  the interleave block in `build.py` revisited.
- Loop lightbox cycles with **instant** swaps regardless of the tile fade (fine now that fade=0).

---

## 4. Next steps (none pending; ideas)

1. Replace the 4 `IMG_0000` placeholders with real portraits (portrait block of layout.txt).
2. (Optional) Cache-bust the gear clips (plain-copied, no `?v=`) if one is ever re-rendered and served
   stale.

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version + `?v=`
on `index.html`'s asset links on every CSS/JS/manifest change. **Ben reviews changes on dev himself —
keep live previews to a minimum (verify with quieter tools; only use the browser preview when you must).**

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

**Files.** `index.html` (shell: top bar, hero, empty `#grid` JS fills, About, footer, lightbox markup;
`viewport-fit=cover`; loads manifest.js then script.js) · `styles.css` (all styling, VSCO-inspired;
`:root` var theming, mobile media query at `max-width:700px`, `env(safe-area-inset-*)` on the fixed
bars) · `script.js` (one IIFE: view switching — **always opens on Photos**; `scrollRestoration=
"manual"` so refresh lands at top; hero slideshow; the unified `renderGrid`; the lightbox).
`manifest.js` + `thumbnails/ photos/ videos/ gear/` are **generated — never hand-edit**.

**Build pipeline (`build.py`; needs Pillow + ffmpeg).** Reads the off-repo catalogue → regenerates
`thumbnails/` (≤1200px long edge, q82), `photos/` (≤2400px, q88), `videos/` (libx264 crf23,
`+faststart`), `gear/` (verbatim copy), and `manifest.js`; then **prunes stale** outputs whose source
is gone. Per image: read EXIF, auto-orient, resize (LANCZOS), bake a visible **© watermark + EXIF
Copyright/Artist** into every derivative, write progressive JPEGs with a content-hash `?v=`. Videos
re-encode only when the source is newer (watermark baked via ffmpeg `drawtext`). Parallelized; manifest
order is authoritative (no mtime sort).
- **Source folder**: `~/Documents/PhotositeCatalogue/` (override with `PHOTOSITE_SOURCE`). **Not in the
  repo, not present in every environment** — if you can't see it, that's expected; you can still edit
  site code, just can't run a full build.
- **Sidecars**: `titles.json` (id→title, auto-created empty, falls back to EXIF ImageDescription);
  `exif_overrides.json` (fills spec fields a cropped export dropped; never clobbers real EXIF).
- Key constants (top of build.py): `THUMB_LONG_EDGE=1200`, `FULL_LONG_EDGE=2400`, `THUMB_QUALITY=82`,
  `FULL_QUALITY=88`, `ADD_WATERMARK`, `WATERMARK_OPACITY`, plus `VIDEO_*` / `LOOP_*` constants.

**Catalogue & layout.**
- **Catalogue = single source of truth**, `~/Documents/PhotositeCatalogue/`: `media/` (subfoldered:
  landscape, portrait, tapes, loop, gear, + nested `*/archive/`) + `layout.txt` + `titles.json` +
  `exif_overrides.json`.
- **layout.txt is BUCKETED BY TYPE, then re-interleaved by the build**: heroes → all landscape-like
  (small landscapes + videos + loop) → all portraits → all mediums, each in display order within its
  type. `build.py` rebuilds the 5-item `[L P P L M]` visual groups
  (`group g = land[2g], port[2g], port[2g+1], land[2g+1], med[g]`) so the **manifest is in visual
  order**. To rearrange, reorder within a block; keep 2 landscape-like : 2 portrait : 1 medium. Roles:
  `hero`, `medium`, `small landscape`, `small portrait`; videos take no role; `loop` is the cycling
  tile. Build warns if a role tag contradicts the image's real orientation.
- **Reserved media subfolder names — matched at ANY depth**: `archive` (hidden, may be nested e.g.
  `landscape/archive/`), `loop` (cycling tile), `gear` (copied to the About page). Any other subfolder
  (`tapes`, `landscape`, `portrait`, …) is pure organization; the index recurses into all of them.
- **Edit-suffix rule**: `_canonical_stem()` strips `_DxO…` and a trailing `-<n>` → bare `IMG_NNNN`, so
  re-edits (`-2`, `-3`) need no layout.txt change. All derivatives carry a content-hash `?v=`.

**Rendering & lightbox.**
- **One renderer, two views**: `renderGrid` renders a **2-column dense masonry from the manifest order**
  (the build produced it by re-interleaving the type-bucketed layout.txt) — desktop AND mobile use it,
  so they can't drift. Medium = full-width band; portrait = tall (2:3); landscape/video/loop = short
  (3:2). **`grid-auto-rows:1px`; the vertical reserve below each tile = the column gap (`reserve =
  colGap`), so gutters are equal in both axes.** **No captions in the grid or hero** — titles/specs
  live only in the lightbox.
- **Hero**: auto-advance **cross-fades**; on mobile a **manual drag slides** (Instagram-style, §2d);
  on desktop the photo **swells on hover**. Dots below the photo (no exif line).
- **Loop tile**: two stacked cross-fading `.loop-frame` layers; `LOOP_INTERVAL_MS=500`,
  `LOOP_FADE_MS=0` (instant).
- **Lightbox** = `[heroes…, grid…]`: heroes clickable (items 0–3), bounded nav (no wrap). Videos muted,
  captioned "Hi-8". Photos/loop show their title + specs. **Custom pinch-zoom/pan/tap-reset/double-tap
  on any touch device (portrait AND landscape — no width gate)**: the viewer owns its zoom via a
  transform on `#lightbox-img`, `touch-action:none`, `Z_MAX=6`, `DOUBLE_TAP_ZOOM=2.5`. Desktop mouse
  is unaffected (touch events don't fire); click-outside closes, arrows + keyboard nav.

**Deploy.** dev → Cloudflare Pages (dev.bendentremont.com); main → GitHub Pages (bendentremont.com).
**Deploy is a merge, not fast-forward** (dev/main diverged); `CNAME` (=bendentremont.com) lives **only
on `main`** — always `cat CNAME` after merging, before pushing. Bump footer version + `?v=` on
index.html asset links on every CSS/JS/manifest change. (Also in Claude Code memory.)

**Aesthetic.** "Ben's Place" — minimalist, VSCO-inspired, wildlife/nature. North star: restraint,
white space, photos do the talking. Preserve the static/no-framework/`build.py`/`file://` model and
the watermark + EXIF-copyright protection on derivatives.

---

## 6. State-file protocol

- Files live in `state/`, named `photosite_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly
  updated) so the architecture context always rides with the latest file.
