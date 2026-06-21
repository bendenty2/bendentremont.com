# PhotoSite — Claude Code Onboarding Brief

**Prepared:** 2026-06-14 · **For:** a fresh Claude Code session taking over the project from Cowork.

Read this top to bottom once. It tells you what the project is, how every piece fits
together, where the files live, how to build and deploy, and the **state-file protocol** you
are expected to follow from now on. After reading it, go to `/state`, open the most recent
state file, and continue from there.

---

## 0. First actions for every new session

1. Read this brief (`CLAUDE_CODE_BRIEF.md`) if you haven't this session.
2. Open the `/state` folder and read the **latest** state file (highest date, then highest
   letter suffix — e.g. `photosite_state_20260614b.md` beats `...20260614a.md`, and a newer
   date beats an older one). That file is the live source of truth for current status and
   next steps. **This brief is stable background; the state file is the moving picture.**
3. Confirm you're on the `dev` branch (`git status`). Do work on `dev`, never directly on
   `main` (see §7).
4. When you finish a sufficiently large chunk of work, **write a new state file** (see §8).

---

## 1. What this project is

A personal photography showcase website for Benjamin d'Entremont — wildlife and nature
photography, shot mostly on a long lens. It is a hobby/portfolio site, **not** commercial.
The aesthetic deliberately **mirrors VSCO**: a clean white canvas, a thin black top bar, a
tightly-packed masonry photo grid, small serif EXIF captions, and a full-screen lightbox.

Design north star: restraint. White space, no clutter, photos do the talking. When in doubt,
match VSCO's feel rather than adding UI.

The site is **static** — plain HTML/CSS/vanilla JS, no framework, no build bundler. A Python
script (`build.py`) is the only "backend": it processes source photos into web assets and
writes a manifest the page reads. Everything is designed to work when the page is opened
directly via `file://` as well as when hosted.

---

## 2. Architecture at a glance

```
Source photos (off-repo)                    Repo / site (this folder)
┌──────────────────────────┐   build.py    ┌────────────────────────────────┐
│ PhotositeCatalogue/       │ ───────────▶  │ thumbnails/  (grid images)     │
│   media/   (flat pool of  │  scans EXIF,  │ photos/      (lightbox images) │
│            all imgs+vids) │  resizes,     │ videos/      (re-encoded+©)    │
│   layout.txt (page order) │  watermarks,  │ manifest.js  (window.PHOTOSITE │
│   titles.json (sidecar)   │  emits assets │              _MANIFEST = {...}) │
└──────────────────────────┘               └────────────────────────────────┘
                                                          │
                                          index.html + styles.css + script.js
                                                          │
                                              Browser renders masonry grid,
                                              hero slideshow, lightbox.
```

Data flow: **you add/remove files in the source catalogue → run `python build.py` → it
regenerates `thumbnails/`, `photos/`, `videos/`, and `manifest.js` → reload `index.html`.**
The site never reads the source folder directly; it only reads what `build.py` emitted.

Why a build script instead of a live server: this was a deliberate decision. The owner
prefers a re-runnable build step over a running dev server. Keep that model — don't introduce
a server-rendered or framework-based architecture without explicit say-so.

Why `manifest.js` (not `.json`): browsers block `fetch()` over `file://`. The manifest is
emitted as a JS file that assigns a global (`window.PHOTOSITE_MANIFEST = {…}`), loaded via a
plain `<script>` tag, so the site works when opened as a local file with no server.

---

## 3. File directory — what every file is

Repo root: `bendentremont.com` (the folder this brief lives in).

**Site source (committed, hand-edited):**
- `index.html` — page shell. Top bar ("Ben's Place" brand + Pics/About nav), the Pics view
  (hero section + empty `#grid` that JS fills), the About view (bio, gear list, contact), the
  copyright footer, and the lightbox markup. Loads `manifest.js` then `script.js` at the end
  of `<body>`.
- `styles.css` — all styling. VSCO-inspired. Notable areas: CSS-variable theming at `:root`
  (colors, fluid `clamp()` gaps and side padding), the fixed top bar with the pill nav
  buttons (white-fill sweep via `::before` + `mix-blend-mode: difference`), hero slideshow
  crossfade, the masonry grid (`grid-auto-rows: 4px`, JS sets row spans), video tile
  crop-and-fill (clips 16:9 pillarbox into a 3:2 slot), the lightbox, and the mobile media
  query (`max-width: 700px`, which carries the dedicated 2-column phone layout).
- `script.js` — all behavior (vanilla JS, one IIFE). Responsibilities: Pics/About view
  switching (**always opens on Photos** — the last tab is not remembered), reads
  `window.PHOTOSITE_MANIFEST`, builds the hero slideshow, renders the **desktop** masonry grid
  via the pattern engine (§5) **and the separate `renderGridMobile` at ≤700px**, and the
  lightbox. The lightbox order is **`[heroes…, grid…]`** — the 4 hero photos are clickable and
  become items 0–3, the catalogue follows; nav is **bounded** (no wrap — left arrow hidden on
  the first item, right arrow on the last). Videos are **muted, no audio**; their grid + lightbox
  caption is the fixed label **"Hi-8"** (`VIDEO_SPEC_LABEL`), not their title (the title shows in
  the lightbox like a photo's).
- `manifest.js` — **generated by `build.py`. Do not hand-edit.** Defines
  `window.PHOTOSITE_MANIFEST` with `generated_at`, `hero`, `heroes[]`, `count`, and
  `photos[]` (each item: `id`, `type`, `span`, `title`, `thumbnail`, `full`, `width`,
  `height`, `exif{aperture,iso,shutter,focal,camera,lens,date}`; videos have `src` instead of
  `thumbnail/full`).

**Generated asset folders (committed so the live site has images; regenerated by build.py):**
- `thumbnails/` — long-edge ≤1200px JPEGs used in the grid. Currently 50 files.
- `photos/` — long-edge ≤2400px JPEGs used in the lightbox. Currently 50 files.
- `videos/` — videos re-encoded by `build.py` (libx264, crf 23) with the © watermark baked in.
  Currently 3 `.mp4` files. Their manifest `src` carries a content-hash `?v=` for cache-busting.

**Build tooling:**
- `build.py` — the asset/manifest generator. ~640 lines, well-commented. See §4.

**Dev/util (git-ignored, not part of the live site):**
- `dev-layout.html` — a standalone offline sandbox for experimenting with the masonry grid
  math (grid overlay, allocation boxes, snap guides). Scratchpad only; not linked from the
  site. Git-ignored.
- `build.log` — scratch log output. Git-ignored.
- `__pycache__/`, `*.pyc` — Python cache. Git-ignored.

**`.gitignore`** currently excludes: `build.log`, `dev-layout.html`, `__pycache__/`, `*.pyc`,
`.DS_Store`, `Thumbs.db`.

**`/state/`** — the state-file folder (see §8). You own this. Create it if missing.

---

## 4. The build pipeline (`build.py`) in detail

Run it with `python build.py` (needs **Pillow**: `pip install Pillow`). Re-run any time
photos are added or removed.

**Source folder** (off-repo, on the owner's machine):
`~/Documents/PhotositeCatalogue/` by default (local storage — migrated off OneDrive on
2026-06-14). Override with the `PHOTOSITE_SOURCE`
environment variable. **This folder is not in the repo and is not present in every
environment** — if you can't see it, that's expected; you can still work on the site code,
you just can't re-run a full build without it.

Expected source layout (as of 2026-06-20 — replaced the old `large_photos/` + `tiles/`
slot-folder scheme):
- `media/` → a **single flat pool** of every image and video (grid tiles AND hero photos).
  Filenames may carry a DxO PhotoLab edit suffix (`IMG_2214_DxO.jpg`); the build **strips the
  `_DxO…` suffix** to get the canonical id (`IMG_2214`), so an edited copy transparently
  replaces the original everywhere (no `layout.txt`/`titles.json` rename needed). If both an
  original and a `_DxO` edit share an id, the **edit wins**. (Owner's DxO workflow: edit → export
  JPEG q100, sRGB, no resize, "no watermark", `_DxO` suffix → drop into `media/` → rebuild.)
- `layout.txt` → **the whole page, top to bottom.** One item per line: `<filename> <role>`.
  - The filename resolves from `media/`; the **extension is optional**.
  - Roles: `hero` (slideshow image — list all heroes first), `medium` (span-2 full-width grid
    tile), `small landscape` / `small portrait` (half-width grid tiles). **Videos take no
    role** (detected by extension). `#` starts a comment; blank lines are ignored.
  - `hero` and `medium` are the real levers (they change `build.py`'s behavior: slideshow
    selection/order, and span-2). The landscape/portrait part is descriptive — the grid still
    renders by the image's real dimensions — but `build.py` **warns** if a tag contradicts the
    actual orientation (catches typos).
  - Reorder = move lines. Add = drop the file in `media/` and add a line. Remove = delete the
    line. See the header comment inside `layout.txt`.
  - **Fallback:** if `layout.txt` is absent, `build.py` errors (there is no longer a tiles
    fallback — that code was removed when the catalogue was consolidated).
- `titles.json` → sidecar mapping `photo_id → human title`. **Auto-created** on first run with
  empty strings for every photo; fill in titles for the ones you care about and re-run to
  apply. Titles also fall back to EXIF `ImageDescription` if the sidecar is blank.

**What the build does per image:** reads EXIF (aperture, ISO, shutter, focal length, plus
camera/lens/date), auto-orients via EXIF transpose, resizes to thumbnail (≤1200) and full
(≤2400) long edges (LANCZOS), bakes a subtle **visible watermark** ("© Benjamin d'Entremont",
bottom-right, ~60% opacity — toggle `ADD_WATERMARK`) **and** EXIF Copyright/Artist tags into
every derivative, then writes progressive optimized JPEGs (quality 82 thumb / 88 full). Each
photo's `thumbnail`/`full` manifest URL carries a **content-hash `?v=`** (same as videos), so a
swapped-in edit appears immediately with no stale CDN/browser cache.
Videos are **re-encoded** into `videos/` with **ffmpeg** (libx264 crf 23, `-movflags +faststart`),
baking in the same © watermark via a `drawtext` filter — placed bottom-right **below** the
camcorder date stamp, tuned by `VIDEO_WM_*` constants (re-done only when the source is newer; a
content-hash `?v=` on the manifest `src` busts the CDN cache). Needs `ffmpeg` on PATH and a TTF
(falls back to a plain copy if either is missing).

**Output:** writes `manifest.js`, deletes any stale `manifest.json`, and **prunes stale
files** — any JPEG in `thumbnails/`/`photos/` or file in `videos/` whose source no longer
exists is deleted. Processing is parallelized with a thread pool. Tile order in the manifest
is authoritative (no mtime sorting).

**Key config constants** (top of `build.py`): `SOURCE_DIR`, `THUMB_LONG_EDGE=1200`,
`FULL_LONG_EDGE=2400`, `THUMB_QUALITY=82`, `FULL_QUALITY=88`, `COPYRIGHT_HOLDER`,
`ADD_WATERMARK`, `WATERMARK_OPACITY=150`, `SUPPORTED_EXTS`, `VIDEO_EXTS`.

---

## 5. The masonry grid layout engine (the trickiest part of `script.js`)

This is the most intricate and most fragile code in the project. Understand it before
touching layout.

The grid tiles photos in a **repeating 7-item pattern**: `[M, H, F, F, H, M, H]` where
- `M` = medium landscape, spans 2 columns, height **2U**
- `H` = half landscape (a small landscape photo **or** a video), spans 1 column, height **U**
- `F` = full portrait, spans 1 column, height **2U**

`U` is a per-group half-unit derived from the group's medium photo so that **every tile's
span is an exact integer multiple of `U`**. Because spans are never rounded independently per
tile, columns stay perfectly aligned with zero rounding drift — the pattern tiles with no
whitespace. CSS sets `grid-auto-rows: 4px` (`ROW_PX`) and JS computes each tile's
`grid-row-end: span N`.

Items from the manifest are sorted into buckets by shape (`medium` = span 2, `full` =
portrait small, `halfPhoto` = landscape small, `video`). The engine fills as many complete
7-item groups as the buckets allow; leftovers that don't complete a group fall back to a
simpler per-tile span formula.

**Fine-tuning constants** (top of the layout section in `script.js`):
- `TILE_PADDING` — per-position vertical nudges as **fractions of U** (so they scale with
  viewport/zoom). Positions map to `[M0, H1, F0, F1, H4, M1, H6]`. (The old `SEQUENCE_PADDING`
  absolute-px override array — a remnant of the removed dev tuner — was deleted 2026-06-20.)
- `GROUP_END_TRIM` — fraction of U trimmed from the last two tiles' row-spans to close the
  gap that negative paddings create.
- `GAP_PX`, `ROW_PX` (must match CSS), `CAPTION_H_PHOTO`, `CAPTION_H_VIDEO`,
  `VIDEO_CROP_RATIO` (3:2).

**This 7-item pattern engine is DESKTOP ONLY.** At ≤700px `renderGrid` delegates to a separate
**`renderGridMobile`** (added 2026-06-20): a dedicated **2-column** layout that reads the same
manifest order but lays it out differently — photos at their native 3:2/2:3 (no crop),
interlocked "4-small" blocks (2 portraits + 2 landscapes whose two columns self-balance),
full-width `medium` bands interleaved so none stack, and the 3 videos dispersed through the
landscape slots. Its spacing knobs are explicit px (`CAP_OFFSET`, `TILE_GAP`) over a 1px
`grid-auto-rows`. **Mobile changes must never affect the desktop engine, and vice versa** —
this is a hard rule from the owner.

Videos: shot 16:9 (Hi-8 footage with ~15% pillarbox bars + a burned-in camcorder date stamp
bottom-right) but displayed in a 3:2 slot by **cropping** the bars — **desktop uses `scaleX(1.28)`
(which stretches the footage horizontally), mobile uses an even `width:143%` scale**, so the
crops differ (desktop shows ~40px less on the right). They autoplay muted and loop everywhere —
**there is no audio**. The © watermark is **baked into the file** by `build.py` (see §4), not
drawn in CSS.

---

## 6. (removed) Dev-mode layout tuner

The old DEV/RECORD live layout tuner has been **fully removed** from the code (only this
historical note remains). To retune the desktop layout, edit the `TILE_PADDING` fractions
(and `GROUP_END_TRIM`) in `script.js` directly, then re-verify at multiple window widths.

---

## 7. Git & deployment

- **Remote:** `origin` → `https://github.com/bendenty2/bendentremont.com.git`
- **Branches:** `dev` (current working branch) and `main` (production).
- **Workflow (confirmed by owner):** do all work on **`dev`**. When a body of work is solid,
  **merge `dev` → `main`**. `main` is the published branch.
- **Deployment: GitHub Pages.** Pushing to `main` publishes the site at **bendentremont.com**.
  So: develop on `dev`, test locally (open `index.html`), merge to `main` to go live.
  - Note: GitHub Pages + custom domain usually means a `CNAME` file and a Pages config. As of
    this brief that hasn't been verified in-repo — **confirm the Pages source branch and that
    a `CNAME` exists; set them up if missing.** Flag what you find in the next state file.
- The repo currently has a single commit ("Initial commit") on `dev`. Commit history going
  forward should be normal, descriptive commits on `dev`.

**Local testing:** just open `index.html` in a browser (works over `file://` thanks to the
`manifest.js` global). No server needed.

---

## 8. STATE-FILE PROTOCOL — important, follow this

To make session-to-session handoff seamless, the project keeps **versioned state files** in a
`/state` folder inside this repo. You are responsible for maintaining them.

**Location:** `bendentremont.com/state/`

**Naming:** `photosite_state_YYYYMMDD<letter>.md`
- `YYYYMMDD` = the date you write it.
- `<letter>` = a lowercase suffix that increments within a single day: the first file of the
  day is `a`, the next `b`, then `c`, …
- A newer date always supersedes an older one regardless of letter.
- Example progression: `photosite_state_20260614a.md` → (same day, later) `…20260614b.md`
  → (next working day) `photosite_state_20260615a.md`.

**The "latest" file = highest date, then highest letter.** That is always the one to read
first and the one that reflects current reality.

**Reading (start of session):** open the latest state file before doing anything else. It
captures current status, recent changes, open threads, and next steps — things this brief
(which is stable) deliberately doesn't track.

**Writing (after a sufficiently large task):** when you complete a meaningful chunk of work
(a feature, a deploy setup, a layout retune, a batch of fixes — not every tiny edit),
**create a brand-new state file** with the next version name. Do **not** edit old state files
in place; each is an immutable snapshot, and the trail of files is the history. You may delete
nothing — leave the older snapshots intact.

**What a state file should contain** (be as long as needed):
1. **Header** — filename, date, who/what produced it, and which file it supersedes.
2. **Current status** — what works right now, what's deployed, what branch things are on.
3. **What changed since the previous state file** — concrete summary of work done.
4. **Open items / known issues / TODOs** — anything unfinished or worth watching.
5. **Next steps** — the recommended next actions, prioritized.
6. **Any context a future session would otherwise have to re-derive** — decisions made and
   why, gotchas, things you tried that didn't work, etc.

Keep the prose plain and skimmable. The goal: a new session reads the brief once for
architecture, then reads the latest state file and can immediately continue without
re-investigating.

---

## 9. Owner's priorities (as of handoff)

The owner wants you to be ready to work across all of these — not strictly in order:
1. **Set up / verify deployment** — get the site live on bendentremont.com via GitHub Pages
   and confirm the Pages source branch + custom-domain `CNAME` are correct.
2. **Layout / CSS refinement** — continue tuning the masonry grid, spacing, hero, and
   responsiveness toward the VSCO feel.
3. **New features** — additive functionality is welcome (e.g. tags/filtering, more views,
   mobile polish), kept consistent with the minimalist aesthetic.

Always preserve: the static/no-framework architecture, the `build.py`-driven workflow, the
`file://`-openable manifest approach, the watermark + EXIF-copyright protection on
derivatives, and the VSCO-inspired restraint.

---

## 10. Quick reference

| Thing | Value |
|---|---|
| Local test | open `index.html` in a browser |
| Rebuild assets + manifest | `python build.py` (needs Pillow) |
| Source photos | `~/Documents/PhotositeCatalogue/` (off-repo, local; or `PHOTOSITE_SOURCE`) |
| Working branch | `dev` |
| Production branch | `main` (GitHub Pages → bendentremont.com) |
| Remote | `github.com/bendenty2/bendentremont.com` |
| Don't hand-edit | `manifest.js`, `thumbnails/`, `photos/`, `videos/` (all generated) |
| Layout tuning | enter DEV mode in the top bar, drag, hit RECORD, paste into `script.js` |
| State files | `bendentremont.com/state/photosite_state_YYYYMMDD<letter>.md` |
| Current contents | 1 hero set, 50 grid photos, 3 videos |

Welcome aboard. Read the latest `/state` file next.
