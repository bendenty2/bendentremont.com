# PhotoSite — State File

**File:** `photosite_state_20260614a.md`
**Date:** 2026-06-14
**Produced by:** Migration handoff from Cowork (first state file).
**Supersedes:** nothing — this is the initial state file.

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture, then use this file for
> current status and next steps. When you finish a sizeable task, write the next state file
> (`photosite_state_20260614b.md`, or a new date) — don't edit this one.

---

## 1. Current status

The site is **functionally complete and working locally**. Built and developed in Cowork up
to this point; now migrating to Claude Code.

What works right now:
- Static site renders from `manifest.js`: hero slideshow, VSCO-style masonry grid with EXIF
  captions, Pics/About views, and the lightbox (photos + videos, keyboard nav, video audio
  toggle).
- `build.py` pipeline is complete: EXIF extraction, thumbnail/full derivatives, visible
  watermark + EXIF copyright tags, titles sidecar, stale-file pruning, video copy.
- Dev-mode layout tuner (DEV/RECORD buttons) is in place for retuning the grid.
- Current content: 1 hero set, **50 grid photos**, **3 videos**.
- `manifest.js` last generated `2026-05-25T14:30:21`.

Git:
- Branch: **`dev`** (clean working tree at handoff).
- `main` also exists. Single commit so far ("Initial commit").
- Remote: `github.com/bendenty2/bendentremont.com`.

---

## 2. What changed since the previous state file

N/A — first state file. Everything above was built in Cowork prior to this handoff.

---

## 3. Open items / known issues

- **Deployment not yet verified in-repo.** Target is GitHub Pages → bendentremont.com. Need
  to confirm the Pages source branch is `main` and that a `CNAME` file exists for the custom
  domain. Neither has been verified.
- **Source catalogue is off-repo** (`~/OneDrive/Desktop/PhotositeCatalogue/`). A full
  `build.py` run requires it; it may not be present in every environment.
- Layout engine is intricate (the 7-item `[M,H,F,F,H,M,H]` pattern). Any layout change must
  be re-checked at multiple window widths and at the 700px mobile breakpoint.

---

## 4. Next steps (recommended, per owner priorities)

1. **Deployment** — verify/set up GitHub Pages: confirm Pages source branch, add a `CNAME`
   for bendentremont.com if missing, push `main`, confirm the live site loads. Record findings
   in the next state file.
2. **Layout / CSS refinement** — continue tuning grid spacing, hero, and responsiveness toward
   the VSCO feel; use DEV mode + RECORD for any padding changes.
3. **New features** — additive, aesthetic-consistent (e.g. tags/filtering, more views, mobile
   polish).

Reminder: develop on `dev`, merge to `main` to publish. Preserve the static/no-framework,
build-script-driven, `file://`-openable architecture and the watermark/copyright protection.

---

## 5. Context worth keeping

- **Why `manifest.js` not `.json`:** `fetch()` is blocked over `file://`; a JS global loaded
  via `<script>` lets the site open as a local file with no server.
- **Why a build script, not a live server:** deliberate owner preference — a re-runnable build
  step over a running dev server.
- **Brand/voice:** site title "Ben's Place"; minimalist, VSCO-inspired; wildlife/nature focus;
  humble-gear, patient-observation tone in the About page.
