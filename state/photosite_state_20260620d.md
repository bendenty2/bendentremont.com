# PhotoSite — State File

**File:** `photosite_state_20260620d.md`
**Date:** 2026-06-20
**Produced by:** Claude Code (continued: hero swipe, About copy, DxO edit pipeline + photo swaps, shipped).
**Supersedes:** `photosite_state_20260620c.md`

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture (kept current), then use this
> file for current status + next steps. When you finish a sizeable task, write the next state
> file — don't edit this one.

---

## 1. Current status

**Everything is shipped to production and dev/main are in sync.**
- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.1.47`**, merge commit
  `2e71eb9`. CNAME (`bendentremont.com`) intact.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.1.47`**, commit
  `d5c6b8a`. (This state file + the brief refresh are committed on `dev` after the merge — they
  ride the next merge, per the usual order.)
- Content: 4 heroes + 49 grid items (14 medium / 14 portrait / 18 landscape / 3 video). Many
  stills are now **DxO PhotoLab edits** (see §2/§5).

---

## 2. What changed since the previous state file (20260620c was at v1.1.42)

- **v1.1.43 — Hero mobile swipe.** On touch + ≤700px, a horizontal swipe on the hero cycles
  slides: **left = next, right = previous, both wrap** (swiping photo 1 right → photo 4). Tap
  still opens the lightbox (a swipe sets a flag that suppresses the tap-to-open). Auto-advance
  continues and resets on swipe. Desktop untouched (dots + click only). All in
  `buildHeroSlideshow` (touchstart/touchend, 40px threshold, horizontal-dominant check).
- **v1.1.44 — About copy.** Reworded the intro ("Welcome to my catalogue! Photography is one of
  my favourite hobbies…") and the protection line ("The media on this site is original and
  protected…").
- **v1.1.45 — DxO edit pipeline (`build.py`).** Two additions: (a) **`_DxO` suffix stripping** —
  a media file `IMG_2214_DxO.jpg` maps to canonical id `IMG_2214`, so an edited copy replaces the
  original everywhere with **no `layout.txt`/`titles.json` rename**; if both exist, the edit wins.
  (b) **Photo cache-busting** — `thumbnail`/`full` manifest URLs now carry a content-hash `?v=`
  (md5[:8] of the output JPEG), like videos already did, so swapped-in edits show immediately with
  no stale cache.
- **v1.1.46 / v1.1.47 — DxO photo swaps.** Two rounds of the owner's DxO-edited stills dropped
  into `media/` and rebuilt (16 then 18 images; some heroes included). Builds ran clean (no
  role-mismatch / missing-file warnings); 15 `_DxO` files currently in `media/`.
- Merged to `main` twice this stretch (v1.1.44, then v1.1.47), CNAME verified each time.

**Owner's DxO export settings (confirmed good):** JPEG quality 100, **ICC = sRGB**, resizing
off (full res), EXIF/IPTC/etc. all included, **Override watermark → "No watermark"** (the build
bakes the © itself), rename **Suffix `_DxO`**. Exports land in a Desktop staging folder, then get
moved into `~/Documents/PhotositeCatalogue/media/`. (Optional nicety suggested: tick "Preserve
color details" for cleaner saturated-color conversion to sRGB.)

---

## 3. Open items / known issues

- **Desktop video horizontal stretch (unfixed, by choice).** Desktop video tiles use
  `transform: scaleX(1.28)` to hide the pillarbox bars, which stretches the whole clip (footage +
  baked watermark) ~28% wider. Mobile scales evenly (no stretch). Offered to switch desktop to an
  even scale (would un-stretch footage + watermark and let the corner watermark stay fully visible
  on desktop); owner hasn't taken it up. The baked video © is tuned for the **mobile** crop, so on
  desktop its right edge may sit a hair outside the tighter desktop crop.
- Carried over: empty the Recycle Bin (old OneDrive copy, ~442 MB); the desktop-vs-mobile video
  **order** now both follow `layout.txt`, so that's settled.

---

## 4. Next steps (none pending; ideas)

1. Continue swapping in DxO edits as they're finished — the pipeline is drop-in: edit → export
   (`_DxO`, q100, sRGB, no watermark) → move into `media/` → `python build.py` → merge.
2. (Optional) The desktop video-crop fix above, if the stretch ever bothers the owner.
3. (Optional) Drag-and-drop visual layout editor that reads/writes `layout.txt` (floated earlier;
   not requested).

Reminder: develop on `dev`, **`git checkout main && git merge dev`** to publish (verify `CNAME`
survives before pushing — it lives only on `main`; ~60s to go live). Bump the footer version +
`?v=` on `index.html`'s asset links on every CSS/JS/manifest change.

---

## 5. Context worth keeping

- **Catalogue = `media/` (flat pool) + `layout.txt` (order/roles) + `titles.json`.** No tiles, no
  `large_photos/` — consolidated. `build.py` errors if `layout.txt` is missing (no fallback).
- **DxO `_DxO` suffix** is stripped to the canonical id; **photos + videos both get content-hash
  `?v=`** cache-busting. See `CLAUDE_CODE_BRIEF.md` §4.
- **Two render paths:** desktop `renderGrid` (7-item `[M,H,F,F,H,M,H]` pattern) and a separate
  **`renderGridMobile`** (2-column, ≤700px). Mobile changes must never touch desktop, and vice
  versa (hard owner rule).
- **Lightbox** = `[heroes…, grid…]`: heroes are clickable (items 0–3), nav is **bounded** (no
  wrap; arrows hide at the ends). Videos are **muted (no audio)**, captioned **"Hi-8"**.
- **Deploy is a merge, not a fast-forward** (dev/main diverged); `CNAME` is **only on `main`** —
  always `cat CNAME` after merging, before pushing. (Also in Claude Code memory.)
- Brand/voice: "Ben's Place"; minimalist, VSCO-inspired, wildlife/nature.
