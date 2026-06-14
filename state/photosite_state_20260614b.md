# PhotoSite — State File

**File:** `photosite_state_20260614b.md`
**Date:** 2026-06-14
**Produced by:** Claude Code (first session after Cowork handoff).
**Supersedes:** `photosite_state_20260614a.md`

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture, then use this file for
> current status and next steps. When you finish a sizeable task, write the next state file
> (`photosite_state_20260614c.md`, or a new date) — don't edit this one.

---

## 1. Current status

The site is **functionally complete, working locally, and confirmed LIVE** at
https://bendentremont.com.

What works right now:
- Static site renders from `manifest.js`: hero slideshow, VSCO-style masonry grid with EXIF
  captions, Pics/About views, and the lightbox (photos + videos, keyboard nav, video audio
  toggle).
- `build.py` pipeline is complete (EXIF, derivatives, watermark + EXIF copyright, titles
  sidecar, stale-file pruning, video copy).
- Dev-mode layout tuner (DEV/RECORD buttons) in place.
- Current content: 1 hero set, **50 grid photos**, **3 videos**.
- `manifest.js` last generated `2026-05-25T14:30:21`.

Git:
- Branch: **`dev`**. New commit this session: `33e600d` "Add onboarding brief and state-file
  folder" (committed `CLAUDE_CODE_BRIEF.md` + `state/`).
- `main` is the production/published branch. `origin/HEAD → main`.
- Remote: `github.com/bendenty2/bendentremont.com`.

---

## 2. What changed since the previous state file

- **Deployment verified (was the top open item).**
  - Live site **loads successfully** at https://bendentremont.com over HTTPS — brand
    "Ben's Place", Pics/About nav, full About bio, and copyright footer all render. Custom
    domain resolves; TLS works.
  - `CNAME` confirmed present **on `main`** containing `bendentremont.com` (correctly absent
    on `dev`, which must not publish).
  - No `.github/workflows/` — Pages uses its built-in branch-based static build, which is
    correct/sufficient for this site.
- **Committed the handoff docs to `dev`:** `CLAUDE_CODE_BRIEF.md` and the `state/` folder are
  now tracked (commit `33e600d`). Owner chose to track them on `dev`; they will propagate to
  `main` on the next `dev → main` merge (owner accepted this — not excluded from publish).

---

## 3. Open items / known issues

- **Pages source-branch dropdown not read at the UI/CLI level.** The live site serving
  `main`'s content is strong practical proof Pages is set to `main`, but the literal
  Settings → Pages "source branch" value wasn't inspected (`gh` CLI not installed in this
  environment; would need the GitHub web UI or `gh`). Low priority — deployment demonstrably
  works.
- **Source catalogue is off-repo** (`~/OneDrive/Desktop/PhotositeCatalogue/`). A full
  `build.py` run requires it; may not be present in every environment.
- Layout engine is intricate (the 7-item `[M,H,F,F,H,M,H]` pattern). Any layout change must
  be re-checked at multiple window widths and at the 700px mobile breakpoint.
- `CLAUDE_CODE_BRIEF.md` / `state/` will land on the live `main` branch on the next merge.
  Harmless (they're just markdown, not linked from the site) but worth a conscious choice if
  the owner later wants a clean publish branch.

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
