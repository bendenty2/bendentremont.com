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
│   large_photos/           │  scans EXIF,  │ photos/      (lightbox images) │
│   tiles/tile1, tile2, …/  │  resizes,     │ videos/      (copied as-is)    │
│   titles.json (sidecar)   │  watermarks,  │ manifest.js  (window.PHOTOSITE │
└──────────────────────────┘  emits assets  │              _MANIFEST = {...}) │
                                            └────────────────────────────────┘
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
  crop-and-fill (clips 16:9 pillarbox into a 3:2 slot), the lightbox, the mobile media query
  (`max-width: 700px`), and the `body.dev-mode` overlay styles.
- `script.js` — all behavior (vanilla JS, one IIFE). Responsibilities: Pics/About view
  switching (remembered in `localStorage`), reads `window.PHOTOSITE_MANIFEST`, builds the
  hero slideshow, renders the masonry grid via the pattern-based layout engine (see §5),
  the lightbox (open / prev-next / keyboard / hover-preload / video audio toggle), evenly
  distributes videos through the photo list, and the **dev-mode layout tuner** (see §6).
- `manifest.js` — **generated by `build.py`. Do not hand-edit.** Defines
  `window.PHOTOSITE_MANIFEST` with `generated_at`, `hero`, `heroes[]`, `count`, and
  `photos[]` (each item: `id`, `type`, `span`, `title`, `thumbnail`, `full`, `width`,
  `height`, `exif{aperture,iso,shutter,focal,camera,lens,date}`; videos have `src` instead of
  `thumbnail/full`).

**Generated asset folders (committed so the live site has images; regenerated by build.py):**
- `thumbnails/` — long-edge ≤1200px JPEGs used in the grid. Currently 50 files.
- `photos/` — long-edge ≤2400px JPEGs used in the lightbox. Currently 50 files.
- `videos/` — source videos copied verbatim (no transcode). Currently 3 `.mp4` files.

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
`~/OneDrive/Desktop/PhotositeCatalogue/` by default. Override with the `PHOTOSITE_SOURCE`
environment variable. **This folder is not in the repo and is not present in every
environment** — if you can't see it, that's expected; you can still work on the site code,
you just can't re-run a full build without it.

Expected source layout:
- `large_photos/` → hero images shown in the slideshow above the grid (each becomes a
  `heroes[]` entry; the first is also stored as legacy `hero`).
- `tiles/tile1/`, `tiles/tile2/`, … → each `tileN` folder is **one 7-item grid group**,
  consumed in numeric order. Each tile has named slot subfolders, one image (or video) per
  slot:
  - **Odd** tile numbers (1, 3, 5, …) — no video: `medium_photo_top`, `medium_photo_bottom`,
    `small_photo_portrait_left`, `small_photo_portrait_right`, `small_photo_top`,
    `small_photo_middle`, `small_photo_bottom`.
  - **Even** tile numbers (2, 4, 6, …) — include a video: same as above but
    `small_photo_middle` is replaced by `video_middle`.
  - To add a group, create the next `tileN` folder and re-run.
- `titles.json` → sidecar mapping `photo_id → human title`. **Auto-created** on first run with
  empty strings for every photo; fill in titles for the ones you care about and re-run to
  apply. Titles also fall back to EXIF `ImageDescription` if the sidecar is blank.

**What the build does per image:** reads EXIF (aperture, ISO, shutter, focal length, plus
camera/lens/date), auto-orients via EXIF transpose, resizes to thumbnail (≤1200) and full
(≤2400) long edges (LANCZOS), bakes a subtle **visible watermark** ("© Benjamin d'Entremont",
bottom-right, ~60% opacity — toggle `ADD_WATERMARK`) **and** EXIF Copyright/Artist tags into
every derivative, then writes progressive optimized JPEGs (quality 82 thumb / 88 full).
Videos are copied as-is into `videos/` (only if newer than the existing copy).

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
  viewport/zoom). Positions map to `[M0, H1, F0, F1, H4, M1, H6]`.
- `SEQUENCE_PADDING` — optional per-tile absolute-px overrides; **keep empty** and prefer
  tuning `TILE_PADDING` fractions, because absolute px don't scale.
- `GROUP_END_TRIM` — fraction of U trimmed from the last two tiles' row-spans to close the
  gap that negative paddings create.
- `GAP_PX`, `ROW_PX` (must match CSS), `CAPTION_H_PHOTO`, `CAPTION_H_VIDEO`,
  `VIDEO_CROP_RATIO` (3:2).

Column count: 3 columns normally, 2 columns at ≤700px.

Videos: shot 16:9 but displayed in a 3:2 slot by **cropping** the pillarbox bars
(`object-fit`/scaleX trick in CSS), never letterboxing. In the grid they autoplay muted and
loop; in the lightbox there's an unmute toggle.

---

## 6. Dev mode (live layout tuner)

`script.js` injects a hidden **DEV** button into the top bar. Toggling it:
- Renders just one reference group plus a dimmed "mirror" copy of it, with a draggable gap
  handle between them, so you can see how consecutive groups butt together.
- Lets you **drag tiles vertically** (snapping to the 4px grid) to dial in per-position
  padding, and drag the gap handle to set the inter-group trim.
- A **RECORD** button copies a ready-to-paste `TILE_PADDING` + `GROUP_END_TRIM` snippet
  (converted from px back into viewport-independent fractions) to the clipboard.

Workflow to retune layout: enter dev mode at full screen, drag tiles until the rhythm looks
right, hit RECORD, paste the snippet over the existing `TILE_PADDING`/`GROUP_END_TRIM`
constants in `script.js`. Always re-verify at multiple window widths afterward, since the
fractions are meant to hold across sizes.

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
| Source photos | `~/OneDrive/Desktop/PhotositeCatalogue/` (off-repo; or `PHOTOSITE_SOURCE`) |
| Working branch | `dev` |
| Production branch | `main` (GitHub Pages → bendentremont.com) |
| Remote | `github.com/bendenty2/bendentremont.com` |
| Don't hand-edit | `manifest.js`, `thumbnails/`, `photos/`, `videos/` (all generated) |
| Layout tuning | enter DEV mode in the top bar, drag, hit RECORD, paste into `script.js` |
| State files | `bendentremont.com/state/photosite_state_YYYYMMDD<letter>.md` |
| Current contents | 1 hero set, 50 grid photos, 3 videos |

Welcome aboard. Read the latest `/state` file next.
