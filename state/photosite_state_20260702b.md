# PhotoSite — State File

**File:** `photosite_state_20260702b.md`
**Date:** 2026-07-02
**Produced by:** Claude Code (continued same day: nested archive folders, refresh-to-top, type-bucketed layout.txt, version → v1.2.1).
**Supersedes:** `photosite_state_20260702a.md` (which was at v1.1.80)

> **This is the single handoff doc.** (`CLAUDE_CODE_BRIEF.md` was retired 2026-07-02; its durable
> architecture/pipeline notes live in §5, and the code is the ultimate source of truth.) Read §1 for
> current status, §5 for how the project works. When you finish a sizeable task, write the next state
> file (protocol in §6) — don't edit this one; carry §5 forward into it.

---

## 1. Current status

**Shipped to production; dev and main are in sync at `v1.2.1`.** (Version jumped 1.1.89 → 1.2.1 by
owner request — no functional change from the bump itself.)
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.2.1`**, CNAME intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.2.1`.** (This state file is
  committed on `dev` and rides the next merge.)
- Content: **4 heroes + 55 grid items** = 51 grid photos (incl. **4 `IMG_0000` portrait
  placeholders**) + 1 loop tile (8 frames) + 3 videos. Grid is **11 clean 5-item groups**.

---

## 2. What changed since v1.1.80 (the previous state file)

*The big v1.1.47→80 arc — video black-bar/seam fix, Lightroom migration, the unified 2-column
rebuild, the loop tile, the custom pinch-zoom viewer, the catalogue restructure — is detailed in
`photosite_state_20260702a.md` and captured as current state in §5. Since then:*

### a. Nested archive folders (v1.1.84)
- Archive folders now live **inside** `landscape/` and `portrait/` (e.g. `media/landscape/archive/`);
  the old flat `media/archive/` is gone. The skip check matches `archive`/`gear`/`loop` at **any
  depth** — `if set(rel.parts[:-1]) & SKIP_SUBDIRS: continue` — so archived photos of either
  orientation stay out of the grid.

### b. Refresh opens at the top of the page (v1.1.85)
- `script.js`: `history.scrollRestoration = "manual"` + `scrollTo(0,0)` on `load`. A reload now lands
  at the top instead of restoring the previous scroll position.

### c. ★ Type-bucketed layout.txt + build re-interleave (v1.1.87) — editing-model change
- **layout.txt is no longer a flat WYSIWYG list.** It is now **bucketed by type**: heroes, then all
  **landscape-like** items (small landscapes + videos + the loop), then all **small portraits**, then
  all **mediums** — each listed in display order *within its own type*.
- **`build.py` re-interleaves** the buckets back into the 5-item visual groups before processing, so
  the manifest (and therefore the lightbox order) stay in true visual order and the **renderer is
  untouched** (still a straight pass over manifest order). Rule:
  `group g = land[2g], port[2g], port[2g+1], land[2g+1], med[g]`. Leftovers that don't complete a
  group are appended in type order (with a build warning).
- **Rearranging** = reorder a line within its own block. In the landscape block an **even** index
  (0,2,4,…) → a group's **top-left** tile, **odd** → its right-side landscape; videos/loop sit in the
  landscape block. Keep the ratio **2 landscape-like : 2 portrait : 1 medium** (currently 22:22:11 =
  11 groups).
- **Verified byte-for-byte**: the restructure reproduced the *identical* visual to v1.1.86. The
  `layout.txt` header comment documents the model.

### d. Version → v1.2.1
- Bumped from 1.1.89 at the owner's request.

---

## 3. Open items / known issues

- **4 `IMG_0000` portrait placeholders** still in the grid (last two groups). Replace with real
  portraits — drop in `media/portrait/`, swap the lines in the **portrait block** of layout.txt,
  rebuild. `IMG_0001` (landscape placeholder) is now **archived**; no stray undisplayed photos remain.
- Loop lightbox cycles with **instant** swaps regardless of the tile fade (fine now that fade=0).
- Custom zoom viewer is **unverified by automated tooling** (no multi-touch in the preview) — dialed
  in by the owner on an iPhone. Any change to lightbox touch code needs manual phone verification.
- The re-interleave (§2c) assumes every group is `[L P P L M]` (2:2:1). A different group shape would
  need the `_bucket`/interleave block in `build.py` revisited.

---

## 4. Next steps (none pending; ideas)

1. Replace the 4 `IMG_0000` placeholders with real portraits (portrait block of layout.txt).
2. (Optional) Cache-bust the gear clips (plain-copied, no `?v=`) if one is ever re-rendered and the
   CDN serves it stale.

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60 s to go live). Bump the footer version + `?v=`
on `index.html`'s asset links on every CSS/JS/manifest change.

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
opens on Photos**; **`scrollRestoration="manual"` so refresh lands at top**; hero slideshow; the
unified `renderGrid`; the lightbox). `manifest.js` + `thumbnails/ photos/ videos/ gear/` are
**generated — never hand-edit**.

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
  `FULL_QUALITY=88`, `ADD_WATERMARK`, `WATERMARK_OPACITY`, plus `VIDEO_*` / `LOOP_*` / render constants.

**Catalogue & layout.**
- **Catalogue = single source of truth**, `~/Documents/PhotositeCatalogue/`: `media/` (subfoldered:
  landscape, portrait, tapes, loop, gear, + nested `*/archive/`) + `layout.txt` + `titles.json` +
  `exif_overrides.json`.
- **layout.txt is BUCKETED BY TYPE, then re-interleaved by the build** (see §2c): heroes → all
  landscape-like (small landscapes + videos + loop) → all portraits → all mediums, each in display
  order within its type. `build.py` rebuilds the 5-item `[L P P L M]` visual groups
  (`group g = land[2g], port[2g], port[2g+1], land[2g+1], med[g]`) so the **manifest is in visual
  order**. To rearrange, reorder within a block; keep 2 landscape-like : 2 portrait : 1 medium. Roles
  in layout.txt: `hero`, `medium`, `small landscape`, `small portrait`; videos take no role; `loop` is
  the cycling tile. Build warns if a role tag contradicts the image's real orientation.
- **Reserved media subfolder names — matched at ANY depth**: `archive` (hidden, may be nested e.g.
  `landscape/archive/`), `loop` (cycling tile), `gear` (copied to the About page). Any other subfolder
  (`tapes`, `landscape`, `portrait`, …) is pure organization; the index recurses into all of them.
- **Edit-suffix rule**: `_canonical_stem()` strips `_DxO…` and a trailing `-<n>` → bare `IMG_NNNN`,
  so re-edits (`-2`, `-3`) need no layout.txt change. All derivatives carry a content-hash `?v=`.

**Rendering & lightbox.**
- **One renderer, two views**: `renderGrid` renders a **2-column dense masonry from the manifest
  order** (which the build produced by re-interleaving the type-bucketed layout.txt) — desktop AND
  mobile use it, so they can't drift. Medium = full-width band; portrait = tall (2:3); landscape/
  video/loop = short (3:2); `RESERVE_DESKTOP=34` / `RESERVE_MOBILE=21`, `grid-auto-rows:1px`.
- **Loop tile**: two stacked cross-fading `.loop-frame` layers; `LOOP_INTERVAL_MS=500`,
  `LOOP_FADE_MS=0` (instant).
- **Lightbox** = `[heroes…, grid…]`: heroes clickable (items 0–3), bounded nav (no wrap). Videos
  muted, captioned "Hi-8". Loop cycles full-res. **Custom pinch-zoom/pan/tap-reset/double-tap on
  mobile** — viewer owns its zoom via a transform on `#lightbox-img`, `touch-action:none`, `Z_MAX=6`,
  `DOUBLE_TAP_ZOOM=2.5`; handlers bail above 700px so desktop (mouse) is untouched.

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
