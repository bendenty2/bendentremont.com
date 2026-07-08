# PhotoSite — State File

**File:** `photosite_state_20260708b.md`
**Date:** 2026-07-08
**Produced by:** Claude Code (full efficiency/load-speed audit + implementation: WebP stills, self-hosted fonts, deferred gear/hero loading, manifest trim).
**Supersedes:** `photosite_state_20260708a.md` (which was at v1.2.16)

> **This is the single handoff doc.** (`CLAUDE_CODE_BRIEF.md` was retired 2026-07-02; its durable
> architecture/pipeline notes live in §5, and the code is the ultimate source of truth.) Read §1 for
> current status, §5 for how the project works. When you finish a sizeable task, write the next state
> file (protocol in §6) — don't edit this one; carry §5 forward into it.

---

## 1. Current status

**Shipping to production at `v1.2.19`** (this file rides the merge that ships it).
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.2.19`**, CNAME intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.2.19`.**
- Content unchanged: **4 heroes + 55 grid items** (51 grid photos incl. 4 `IMG_0000` "COMING SOON"
  portrait placeholders + 1 loop tile of 8 frames + 3 videos), 11 clean `[L P P L M]` groups.
  Titles/specs show only in the lightbox. **The efficiency pass changed how assets are delivered, not
  how anything looks** — the rendered output is byte-for-byte the same layout.

---

## 2. What changed since v1.2.16 (the previous state file)

### a. Titles (v1.2.17 → v1.2.18)
- Contact copy dropped to 14px; loop frames titled "Departing Billy Bishop" in titles.json; then three
  titles updated: IMG_3045 → "Mallard", IMG_3328 → "Pine-Roosted Turkey", IMG_7163 → "Cowling".
- `build.py` gained `_find_media_subdir(name)` so `loop`/`gear` are located at ANY depth under
  `media/` (owner nested them into `photos/landscape/…` and `about/gear/`). Index recursion already
  handled stills/videos/nested archives.

### b. ★ Efficiency / load-speed pass (v1.2.19) — no visual change
Full audit; implemented the quality-safe wins (owner explicitly declined anything that could touch
image/video quality — see the "declined" list below).
- **WebP for all stills.** `build.py` now writes `.webp` (const `IMAGE_EXT="webp"`, `_save_image()`
  dispatches WebP `method=6` vs JPEG by extension). Thumbnails **5.2→3.4 MB**, full photos **24→16 MB**
  (~33% lighter) at the same quality constants (thumb q82 / full q88). Watermark (pixels) + EXIF
  Copyright/Artist are preserved in WebP. Manifest URLs are now `…​.webp?v=<hash>`. Browser support is
  universal.
- **Gear videos `preload="auto"`→`"none"`** (index.html). ~12 MB no longer downloads for the hidden
  About tab; `setActiveView("about")` already `.play()`s them, which triggers the load on demand
  (verified: readyState 4, playing).
- **Hero deferral** (script.js). Only hero 0 (the LCP) sets `img.src` up front; heroes 2–4 carry
  `dataset.src` and are loaded by `ensureHeroLoaded(i)` — called for the active slide **and the next
  one** in `showHeroSlide()` (so the fade is always ready), plus for the drag neighbour in `touchmove`.
- **Self-hosted DM Sans** (fonts/ + `@font-face` at top of styles.css). Dropped the Google Fonts
  `<link>` + preconnects; only weights **400 + 500** are used (600/700 were dead). Two woff2 files
  (`dmsans-latin.woff2` 37 KB, `dmsans-latin-ext.woff2` 18 KB — the exact v17 files Google serves, each
  covering both weights); latin is `<link rel=preload>`-ed in index.html.
- **Manifest trim.** `_exif_fields()` no longer emits `camera`/`lens`/`date` (the lightbox only shows
  aperture/iso/shutter/focal). Removed the now-dead `_format_date()`.
- **Video preset `medium`→`slow`** in build.py (same crf 23). Kept for FUTURE encodes only — on the
  current Hi-8 clips it saved just ~1.4%, not worth re-committing 26 MB of near-identical video, so the
  committed video bytes + their manifest `?v=` hashes were left untouched (restored after the rebuild).
- Stale-file cleanup is now extension-aware (prunes old `.jpg` after the WebP switch). Removed a stale
  `renderGridMobile` comment in styles.css.

**Owner declined (quality trade-offs):** responsive `srcset`/smaller thumbnails (wants full quality even
if users pinch-zoom a thumbnail), higher video CRF, lower photo/thumb resolution, AVIF. Don't revisit
without a fresh ask.

---

## 3. Open items / known issues

- **4 `IMG_0000` portrait placeholders** still in the grid (last two groups), titled "COMING SOON".
  Replace with real portraits — drop in `media/photos/portrait/`, swap the lines in the portrait block
  of layout.txt, rebuild.
- Custom zoom viewer + hero slide are **touch-gesture features unverifiable by the preview** (no
  multi-touch / drag simulation) — dialed in by the owner on an iPhone. Any change to lightbox or hero
  touch code needs manual phone verification. (The v1.2.19 hero deferral touches `touchmove` only to
  `ensureHeroLoaded(nIdx)` the neighbour — logic unchanged, but worth a quick swipe-check on device.)
- The re-interleave assumes every group is `[L P P L M]` (2:2:1). A different shape needs the interleave
  block in build.py revisited.
- Residual masonry alignment is sub-pixel (<0.5px) — the integer-grid-row rounding floor.
- **Preview gotcha:** the grid builds inside `requestAnimationFrame`, which is throttled in a
  backgrounded preview tab — a fresh eval right after `reload()` can show 0 tiles. Stop+start the
  preview server for a real foreground render. The screenshot tool can also time out decoding 50+ WebP
  at once; verify via DOM/network eval instead.

---

## 4. Next steps (none pending; ideas)

1. Replace the 4 `IMG_0000` placeholders with real portraits (portrait block of layout.txt).
2. (Optional) Cache-bust the gear clips (plain-copied, no `?v=`) if one is ever re-rendered.
3. (Optional, advanced) AVIF with a `<picture>`/WebP fallback would beat WebP by another ~30–40%, but
   needs an AVIF encoder in the build + owner sign-off (it's a re-encode).

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version + `?v=`
on `index.html`'s asset links on every CSS/JS/manifest change. **Ben is fine with the live preview
panel — use it whenever it helps verify.**

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
`viewport-fit=cover`; **self-hosted font preload**; loads manifest.js then script.js) · `styles.css`
(all styling, VSCO-inspired; **`@font-face` for self-hosted DM Sans 400/500 at the top**; `:root` var
theming, mobile media query at `max-width:700px`, `env(safe-area-inset-*)` on the fixed bars,
`html { scrollbar-gutter: stable }`) · `script.js` (one IIFE: view switching — **always opens on
Photos**, tab click scrolls the view to its top; `scrollRestoration="manual"`; hero slideshow with
**lazy per-slide loading** via `ensureHeroLoaded()`; the unified `renderGrid`; the lightbox).
`manifest.js` + `thumbnails/ photos/ videos/ gear/ fonts/` — `fonts/` is committed (the two woff2s);
the image/video/manifest outputs are **generated — never hand-edit**.

**Build pipeline (`build.py`; needs Pillow + ffmpeg).** Reads the off-repo catalogue → regenerates
`thumbnails/` (≤1200px long edge, q82), `photos/` (≤2400px, q88) **as WebP** (`IMAGE_EXT`,
`_save_image()`), `videos/` (libx264 crf23 `-preset slow` `+faststart`), `gear/` (verbatim copy), and
`manifest.js`; then **prunes stale** outputs whose source is gone OR whose format we no longer emit
(extension-aware). Per image: read EXIF, auto-orient, resize (LANCZOS), bake a visible **© watermark +
EXIF Copyright/Artist** into every derivative, write a content-hash `?v=`. Videos re-encode only when
the source is newer (watermark via ffmpeg `drawtext`). Parallelized; manifest order is authoritative.
- **Source folder**: `~/Documents/PhotositeCatalogue/` (override with `PHOTOSITE_SOURCE`). **Not in the
  repo, not present in every environment** — if you can't see it, that's expected; you can still edit
  site code, just can't run a full build.
- **Sidecars**: `titles.json` (id→title, falls back to EXIF ImageDescription); `exif_overrides.json`
  (fills spec fields a cropped export dropped; never clobbers real EXIF).
- Key constants (top of build.py): `THUMB_LONG_EDGE=1200`, `FULL_LONG_EDGE=2400`, `THUMB_QUALITY=82`,
  `FULL_QUALITY=88`, **`IMAGE_EXT="webp"`** (set to `"jpg"` to revert format), `ADD_WATERMARK`,
  `WATERMARK_OPACITY`, plus `VIDEO_*` / `LOOP_*` constants.
- Manifest per-photo `exif` carries only **aperture/iso/shutter/focal** (the lightbox spec line);
  camera/lens/date were dropped in v1.2.19.

**Catalogue & layout.**
- **Catalogue = single source of truth**, `~/Documents/PhotositeCatalogue/`: `media/` + `layout.txt` +
  `titles.json` + `exif_overrides.json`. The owner nests `media/` freely (e.g. `photos/landscape/…`,
  `photos/portrait/…`, `about/gear/`).
- **layout.txt is BUCKETED BY TYPE, then re-interleaved by the build**: heroes → all landscape-like
  (small landscapes + videos + loop) → all portraits → all mediums, each in display order within its
  type. `build.py` rebuilds the 5-item `[L P P L M]` visual groups
  (`group g = land[2g], port[2g], port[2g+1], land[2g+1], med[g]`) so the manifest is in visual order.
  To rearrange, reorder within a block; keep 2 landscape-like : 2 portrait : 1 medium.
- **Reserved media subfolder names — matched at ANY depth** (via `_find_media_subdir` for loop/gear,
  and a `SKIP_SUBDIRS` parts-check for archive): `archive` (hidden), `loop` (cycling tile), `gear`
  (copied to About). Any other subfolder (`tapes`, `landscape`, `portrait`, …) is pure organization;
  the index recurses into all of them.
- **Edit-suffix rule**: `_canonical_stem()` strips `_DxO…` and a trailing `-<n>` → bare `IMG_NNNN`, so
  re-edits (`-2`, `-3`) need no layout.txt change. All derivatives carry a content-hash `?v=`.

**Rendering & lightbox.**
- **One renderer, two views**: `renderGrid` renders a **2-column dense masonry from the manifest order**
  — desktop AND mobile use it, so they can't drift. Medium = full-width band; portrait = tall (2:3);
  landscape/video/loop = short (3:2). `grid-auto-rows:1px`; vertical reserve below each tile = the
  column gap (`reserve = colGap`), so gutters are equal in both axes. **No captions in the grid or
  hero** — titles/specs live only in the lightbox.
- **Gotcha — the grid must render at the *final* viewport width**, or the row-spans (fixed at render)
  won't match the reflowed images. `html { scrollbar-gutter: stable }` guarantees this by reserving the
  scrollbar's width up front. If you change the render trigger, keep that invariant. (See also the
  preview rAF-throttle note in §3.)
- **Hero**: auto-advance **cross-fades**; on mobile a **manual drag slides** (Instagram-style); on
  desktop the photo **swells on hover**. Dots below (no exif line). **Slides load lazily** — only hero 0
  up front; `ensureHeroLoaded()` pulls each slide on first need and pre-loads the next.
- **Loop tile**: two stacked cross-fading `.loop-frame` layers; `LOOP_INTERVAL_MS=500`,
  `LOOP_FADE_MS=0` (instant).
- **Lightbox** = `[heroes…, grid…]`: heroes clickable (0–3), bounded nav (no wrap). Videos muted,
  captioned "Hi-8". Photos/loop show title + specs. **Custom pinch-zoom/pan/tap-reset/double-tap on any
  touch device (portrait AND landscape — no width gate)**: transform on `#lightbox-img`,
  `touch-action:none`, `Z_MAX=6`, `DOUBLE_TAP_ZOOM=2.5`. Desktop mouse unaffected; click-outside closes.

**Performance posture (as of v1.2.19).** Stills are WebP; fonts self-hosted (400/500 only, latin woff2
preloaded); gear videos `preload="none"` (load on About open); hero slides 2–4 deferred; manifest EXIF
trimmed. Owner has **declined any change that could reduce image/video quality** (srcset/smaller
thumbs, higher CRF, lower resolution, AVIF re-encode) — treat those as off-limits without a fresh ask.
Videos (the biggest bytes) are already near-optimal at crf23; `-preset slow` is set for future encodes.

**Deploy.** dev → Cloudflare Pages (dev.bendentremont.com); main → GitHub Pages (bendentremont.com).
**Deploy is a merge, not fast-forward**; `CNAME` (=bendentremont.com) lives **only on `main`** — always
`cat CNAME` after merging, before pushing. Bump footer version + `?v=` on index.html asset links on
every CSS/JS/manifest change. (Also in Claude Code memory.)

**Aesthetic.** "Ben's Place" — minimalist, VSCO-inspired, wildlife/nature. North star: restraint, white
space, photos do the talking. Preserve the static/no-framework/`build.py`/`file://` model and the
watermark + EXIF-copyright protection on derivatives.

---

## 6. State-file protocol

- Files live in `state/`, named `photosite_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly
  updated) so the architecture context always rides with the latest file.
