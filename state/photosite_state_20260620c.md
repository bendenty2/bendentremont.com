# PhotoSite — State File

**File:** `photosite_state_20260620c.md`
**Date:** 2026-06-20
**Produced by:** Claude Code (session continued: clickable heroes, video watermarks, captions/order, then shipped to production).
**Supersedes:** `photosite_state_20260620b.md`

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture (updated this session), then
> use this file for current status and next steps. When you finish a sizeable task, write the
> next state file — don't edit this one.

---

## 1. Current status

**Everything is shipped to production.**
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.1.42`**, merge commit
  `cd5b456`. CNAME (`bendentremont.com`) intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.1.42`**, commit
  `be94944` — in sync with production (main is the merge of dev). The only thing on `dev` not yet
  on `main`: this state file + the `CLAUDE_CODE_BRIEF.md` doc refresh (committed after the merge,
  per the owner's order; they'll ride the next merge).
- Content: 4 heroes + 49 grid items (14 medium / 14 portrait / 18 landscape / 3 video).

---

## 2. What changed since the previous state file (20260620b was at v1.1.30, pre-merge)

- **v1.1.31 — Titles + cache-bust.** Rebuilt manifest from the owner's updated `titles.json`
  (all photos + the 3 videos now titled). Added a `?v=` cache-buster to **`manifest.js`** in
  index.html (it had none, so content updates could be masked by the CDN).
- **v1.1.32 — Hero images are clickable.** The lightbox order is now **`[heroes…, grid…]`**:
  the 4 hero photos become items 0–3 (click the hero slideshow → opens at the current slide),
  the catalogue follows from index `heroItems.length`. Grid tiles open at `heroItems.length + i`
  (both `renderGrid` and `renderGridMobile`). Nav is now **bounded — no wrap**: left arrow hidden
  on the first item, right arrow on the last (`updateNavArrows`, `step` clamps, hidden arrows
  dropped from focus trap).
- **v1.1.33 — Video order follows `layout.txt` on both views.** Reordered the 3 video lines in
  `layout.txt` (beach → rewind → fire) and **removed the hardcoded mobile `VIDEO_ORDER` sort**,
  so desktop and mobile both take video order straight from the manifest/layout. Reorder videos
  by moving their lines + rebuild.
- **v1.1.34/35 — Video captions.** Grid caption for videos is the fixed label **"Hi-8"** (not
  the title); the lightbox shows the video's real **title** with **"Hi-8"** on the spec line
  below it (mirrors a photo's EXIF). Single source: `VIDEO_SPEC_LABEL` in `script.js`.
- **v1.1.36–v1.1.42 — Videos get the © watermark baked in.** `build.py`'s `process_video` now
  **re-encodes** each clip with **ffmpeg** (libx264 crf 23, `+faststart`) and a `drawtext`
  overlay of the same "© Benjamin d'Entremont" mark as the stills (Arial — the font the stills
  resolve to — white @ `WATERMARK_OPACITY/255`, subtle shadow). The re-encode also **shrank the
  files** a lot (beach 23.4→6.0 MiB). Manifest `src` carries a **content-hash `?v=`** so a
  changed clip isn't masked by the CDN. Placement (after several rounds of owner feedback) is
  **bottom-right, BELOW the camcorder date stamp**, a letter's height in from the edges — tuned
  by `VIDEO_WM_FONTSIZE=20`, `VIDEO_WM_RIGHT=334`, `VIDEO_WM_BOTTOM=16`.
- **Docs:** `CLAUDE_CODE_BRIEF.md` refreshed (video re-encode/watermark, clickable heroes +
  bounded nav, Hi-8 captions, the desktop-vs-mobile video crop difference).

(Earlier in the same calendar day, pre-merge: the audio removal, lightbox prev/next z-index fix,
always-open-on-Photos, footer nudge (v1.1.29); the `layout.txt` + `media/` authoring system and
catalogue consolidation; the dev-tuner/`SEQUENCE_PADDING` removal (v1.1.30). Those are detailed
in 20260620b.)

---

## 3. Open items / known issues

- **Desktop video crop stretches + over-crops the right.** The desktop tiles use
  `transform: scaleX(1.28)` to hide the pillarbox bars, which (a) stretches the footage + baked
  watermark ~28% horizontally and (b) shows ~40px less on the right than mobile's even
  `width:143%` scale (so the right edge of the date stamp — and a too-far-right watermark — clips
  on desktop). The current watermark x (`RIGHT=334`) sits safely inside the desktop crop. **Open
  offer to the owner:** switch desktop to the even scale (one CSS rule) to kill the stretch and
  align the crops; declined so far, not urgent.
- **`small landscape`/`small portrait` tags are descriptive**, not authoritative (grid buckets
  by real dimensions; `build.py` only warns on a mismatch).
- Video watermarking needs **`ffmpeg` on PATH + a TTF** at build time (falls back to a plain copy
  otherwise) — fine on the owner's Windows box (winget ffmpeg, `C:\Windows\Fonts\arial.ttf`).
- `VIDEO_WM_*` placement is tuned for the **1920×1080** Hi-8 clips; a differently-sized video
  would need new values.

---

## 4. Next steps

1. Nothing outstanding — production is current. Continue curating via `layout.txt` + `python
   build.py`.
2. Optional: take up the desktop-crop fix (kills the video stretch); optional drag-and-drop
   `layout.txt` editor (discussed, deferred).
3. The brief + this state file ride the next `dev → main` merge.

Reminder: develop on `dev`, merge to `main` to publish (**`cat CNAME` before pushing main**).
**Mobile and desktop layout engines are separate — never let a change to one affect the other.**
Bump the footer version + every `?v=` (styles, script, **and manifest.js**) on each change.

---

## 5. Context worth keeping

- **Authoring:** `media/` (flat pool of all images + videos + heroes) + `layout.txt` (ordered,
  role-tagged: `hero` / `medium` / `small landscape` / `small portrait`; videos untagged). Order
  drives both renderers + the hero list. `build.py` resolves names from `media/`.
- **Lightbox = `[heroes…, grid…]`**, bounded nav. Heroes (items 0–3) are clickable.
- **Videos:** re-encoded + watermarked by `build.py` (ffmpeg). Caption "Hi-8" in grid; title +
  "Hi-8" in lightbox. No audio anywhere. Desktop crop `scaleX(1.28)` (stretches); mobile
  `width:143%` (even) — **the two crops differ**, which constrains baked-in overlays.
- **Two separate render paths:** desktop 7-item `[M,H,F,F,H,M,H]` pattern engine; mobile
  `renderGridMobile` (2-col, native 3:2/2:3, px knobs over 1px `grid-auto-rows`). Desktop look is
  hand-tuned and must stay untouched by mobile work.
- **Deploy is a MERGE, not fast-forward** — `dev`/`main` diverged; **`CNAME` lives only on
  `main`**. `git merge dev` preserves it via 3-way merge, but **always `cat CNAME` before
  pushing**. Pages live ~60s after push. (Also in Claude Code memory `dev-preview-hosting`.)
- **Cache-busting:** `?v=` on styles.css / script.js / **manifest.js** (bumped with the footer
  version) + a content-hash `?v=` on each video `src`. Cloudflare ignores `_headers` for assets.
- **Two GitHub accounts** on this machine: `bendenty2` (this repo) vs `aiceinc` — per-repo
  credential isolation via local `useHttpPath`, never global.
- **Brand/voice:** "Ben's Place"; minimalist, VSCO-inspired, wildlife/nature.
