# PhotoSite — State File

**File:** `photosite_state_20260708a.md`
**Date:** 2026-07-08
**Produced by:** Claude Code (desktop grid-alignment fix via scrollbar-gutter, nav tabs scroll-to-top, About/contact copy + styling).
**Supersedes:** `photosite_state_20260707a.md` (which was at v1.2.8)

> **This is the single handoff doc.** (`CLAUDE_CODE_BRIEF.md` was retired 2026-07-02; its durable
> architecture/pipeline notes live in §5, and the code is the ultimate source of truth.) Read §1 for
> current status, §5 for how the project works. When you finish a sizeable task, write the next state
> file (protocol in §6) — don't edit this one; carry §5 forward into it.

---

## 1. Current status

**Shipped to production; dev and main are in sync at `v1.2.16`.**
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.2.16`**, CNAME intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.2.16`.** (This state file is
  committed on `dev` and rides the merge that ships it.)
- Content: **4 heroes + 55 grid items** = 51 grid photos (incl. **4 `IMG_0000` portrait placeholders**,
  titled "COMING SOON") + 1 loop tile (8 frames) + 3 videos. Grid is **11 clean 5-item groups**.
  Titles/specs show only in the lightbox.

---

## 2. What changed since v1.2.8 (the previous state file)

### a. ★ Desktop grid alignment — reserve the scrollbar (v1.2.9)
- **Root cause:** the grid renders (via rAF after load) while the page is short and has **no** scrollbar;
  then the tall grid makes the classic Windows/desktop scrollbar appear, narrowing the viewport ~15px.
  The images (`width:100%`) reflow, but the already-computed masonry **row-spans don't** — so photo
  bottoms drifted a systematic **~6.5px** and the vertical gaps inflated. Mobile was fine (overlay
  scrollbars don't change width — which is why it looked perfect).
- **Fix:** `html { scrollbar-gutter: stable }` reserves the scrollbar's width from the start, so the
  viewport width never shifts → the grid renders at its final width. Misalignment dropped to sub-pixel
  (matches mobile). Measured: bottom misalign 6.55px → 0.3px, vertical gap 17.25px → 12.45px (≈ the 12px
  column gap).

### b. Nav tabs open at the top (v1.2.10 → v1.2.11)
- Clicking a nav tab now lands at the **top of that view**: **instant** scroll-to-top when switching
  views (the new view just appears at the top — fixes About inheriting the Photos scroll position),
  **smooth** when re-tapping the tab you're already on (matches the "Ben's Place" brand button). So the
  Photos tab doubles as a "back to top" when you're scrolled down.

### c. About / contact copy + styling (v1.2.12 → v1.2.16)
- Reworded the About intro + contact copy (owner-supplied). The contact blurb is now **center-aligned
  everywhere** (dropped a mobile-only left-align override) at **15px** (same as the rest of the About
  text).

---

## 3. Open items / known issues

- **4 `IMG_0000` portrait placeholders** still in the grid (last two groups), titled "COMING SOON".
  Replace with real portraits — drop in `media/portrait/`, swap the lines in the **portrait block** of
  layout.txt, rebuild.
- Custom zoom viewer + hero slide are **touch-gesture features unverifiable by the preview** (no
  multi-touch / drag simulation) — dialed in by the owner on an iPhone. Any change to lightbox or hero
  touch code needs manual phone verification.
- The re-interleave assumes every group is `[L P P L M]` (2:2:1). A different group shape would need the
  interleave block in `build.py` revisited.
- Loop lightbox cycles with **instant** swaps regardless of the tile fade (fine now that fade=0).
- Residual masonry alignment is sub-pixel (<0.5px) — the integer-grid-row rounding floor. If ever asked
  for literal-zero, force integer photo heights on top of the scrollbar-gutter fix (diminishing returns).

---

## 4. Next steps (none pending; ideas)

1. Replace the 4 `IMG_0000` placeholders with real portraits (portrait block of layout.txt).
2. (Optional) Cache-bust the gear clips (plain-copied, no `?v=`) if one is ever re-rendered and served
   stale.

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version + `?v=`
on `index.html`'s asset links on every CSS/JS/manifest change. **Ben is fine with the live preview
panel — use it whenever it helps verify (esp. rendered geometry); no need to avoid it.**

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
bars, `html { scrollbar-gutter: stable }`) · `script.js` (one IIFE: view switching — **always opens on
Photos**, and a tab click scrolls the view to its top; `scrollRestoration="manual"` so refresh lands at
top; hero slideshow; the unified `renderGrid`; the lightbox). `manifest.js` + `thumbnails/ photos/
videos/ gear/` are **generated — never hand-edit**.

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
- **Gotcha — the grid must render at the *final* viewport width**, or the row-spans (fixed at render)
  won't match the reflowed images. `html { scrollbar-gutter: stable }` guarantees this by reserving the
  scrollbar's width up front (see §2a). If you ever change the render trigger, keep that invariant.
- **Hero**: auto-advance **cross-fades**; on mobile a **manual drag slides** (Instagram-style); on
  desktop the photo **swells on hover**. Dots below the photo (no exif line).
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
