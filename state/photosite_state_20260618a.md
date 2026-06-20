# PhotoSite — State File

**File:** `photosite_state_20260618a.md`
**Date:** 2026-06-18
**Produced by:** Claude Code (session: OneDrive→local migration verification + deploy).
**Supersedes:** `photosite_state_20260614b.md`

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture, then use this file for
> current status and next steps. When you finish a sizeable task, write the next state file
> (`photosite_state_20260618b.md`, or a new date) — don't edit this one.

---

## 1. Current status

The site is **functionally complete, working locally, and confirmed LIVE** at
https://bendentremont.com.

What works right now:
- Static site renders from `manifest.js`: hero slideshow, VSCO-style masonry grid with EXIF
  captions, Pics/About views, and the lightbox (photos + videos, keyboard nav, video audio
  toggle).
- `build.py` pipeline is complete (EXIF, derivatives, watermark + EXIF copyright, titles
  sidecar, stale-file pruning, video copy) and now sources from **local storage** (see §2).
- Dev-mode layout tuner (DEV/RECORD buttons) in place.
- Current content: 4 hero photos, **49 grid items** (4 non-video tiles, 3 video tiles).

Git (all synced to remote this session):
- Branch: **`dev`**, level with `origin/dev` at `2f967b2`.
- **`main` is current and deployed**: merged `dev` → `main` (`bb942df`) and pushed to
  `origin/main`. CNAME (`bendentremont.com`) preserved on `main`. Live deploy healthy.
- Remote: `github.com/bendenty2/bendentremont.com`.

---

## 2. What changed since the previous state file

- **OneDrive → local storage migration COMPLETE and verified end-to-end.**
  - `build.py` default `SOURCE_DIR` now resolves to `~/Documents/PhotositeCatalogue`
    (literal local path), not the OneDrive-redirected shell folder. `PHOTOSITE_SOURCE`
    override unchanged. (Commits `60c6d2c`, `2f967b2`.)
  - Verified the local catalogue is byte-complete vs the old OneDrive copy (identical trees,
    54 files / 442 MB) and that a full `build.py` run completes clean against the local path
    (4 heroes, 49 grid items, 3 videos).
  - **Old OneDrive copy removed** — sent to the Recycle Bin (recoverable; owner to empty the
    bin when ready to reclaim ~442 MB).
  - `CLAUDE_CODE_BRIEF.md` updated to point at the local path (was OneDrive).
- **Deployed to production:** merged `dev` → `main` and pushed both branches to origin.
- **GitHub auth fixed (multi-account machine).** Pushes were 403ing because Git Credential
  Manager defaulted to the **`aiceinc`** account (a separate, unrelated AICE project on this
  machine) for all of `github.com`. Fix: set `credential.https://github.com.useHttpPath=true`
  in this repo's **local** config only (global untouched), isolating this repo's credential by
  path. This repo now authenticates as **`bendenty2`**; AICE keeps its `aiceinc` login with no
  re-login. (Also recorded in Claude Code project memory.)

---

## 3. Open items / known issues

- **Empty the Recycle Bin** to actually reclaim the ~442 MB freed by removing the OneDrive
  copy (left to the owner as a deliberate, recoverable step).
- **Pages source-branch dropdown not read at the UI/CLI level.** Live site serving `main`'s
  content is strong practical proof Pages is set to `main`; the literal Settings → Pages value
  wasn't inspected (`gh` CLI not installed here). Low priority — deployment demonstrably works.
- **Source catalogue is off-repo** (`~/Documents/PhotositeCatalogue/`, now local). A full
  `build.py` run requires it; may not be present in every environment.
- Layout engine is intricate (the 7-item `[M,H,F,F,H,M,H]` pattern). Any layout change must
  be re-checked at multiple window widths and at the 700px mobile breakpoint.
- `CLAUDE_CODE_BRIEF.md` / `state/` are now on the live `main` branch (landed via this merge).
  Harmless (markdown, not linked from the site) but worth a conscious choice if the owner later
  wants a clean publish branch.

---

## 4. Next steps (recommended, per owner priorities)

1. **Layout / CSS refinement** — continue tuning grid spacing, hero, and responsiveness toward
   the VSCO feel; use DEV mode + RECORD for any padding changes.
2. **New features** — additive, aesthetic-consistent (tags/filtering, more views, mobile
   polish).
3. (Optional) Confirm the Pages source-branch dropdown in the GitHub UI for completeness, or
   install `gh` for future CLI-level repo/Pages checks.

Reminder: develop on `dev`, merge to `main` to publish. Preserve the static/no-framework,
build-script-driven, `file://`-openable architecture and the watermark/copyright protection.

---

## 5. Context worth keeping

- **Two GitHub accounts on this machine:** `bendenty2` (this repo) and `aiceinc` (separate AICE
  project). Credential isolation is per-repo via local `useHttpPath` — do NOT set it globally
  or replace the host-level github.com credential, or AICE auth breaks. See project memory.
- **Why `manifest.js` not `.json`:** `fetch()` is blocked over `file://`; a JS global loaded
  via `<script>` lets the site open as a local file with no server.
- **Why a build script, not a live server:** deliberate owner preference — a re-runnable build
  step over a running dev server.
- **Brand/voice:** site title "Ben's Place"; minimalist, VSCO-inspired; wildlife/nature focus;
  humble-gear, patient-observation tone in the About page.
- **Deployment model:** GitHub Pages serves `main` (branch-based build, no Actions workflow);
  `CNAME` on `main` provides the custom domain. Pushing/merging to `main` publishes.
- **WebFetch caveat:** the live-site check uses a non-JS renderer, so it confirms the page
  shell + About content but won't show the JS-populated photo grid. Site shell loading is
  sufficient proof the deploy is healthy.
