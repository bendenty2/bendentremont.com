# PhotoSite — State File

**File:** `photosite_state_20260620a.md`
**Date:** 2026-06-20
**Produced by:** Claude Code (session: mobile-first redesign of the catalogue + About page, then deploy).
**Supersedes:** `photosite_state_20260618a.md`

> New session: read `CLAUDE_CODE_BRIEF.md` once for architecture, then use this file for
> current status and next steps. When you finish a sizeable task, write the next state file
> (`photosite_state_20260620b.md`, or a new date) — don't edit this one.

---

## 1. Current status

The site is **functionally complete and LIVE** at https://bendentremont.com, now running a
**dedicated mobile layout** (phones ≤700px) on top of the unchanged desktop experience.

- **Production (`main` → GitHub Pages → bendentremont.com): LIVE at `v1.1.28`**, commit
  `d570e67` (merge). CNAME (`bendentremont.com`) preserved.
- **Dev preview (`dev` → Cloudflare Pages → dev.bendentremont.com): `v1.1.28`**, commit
  `e871e2d`. dev and main are in sync (same content; main also carries CNAME).
- Both branches level with their remotes. Remote: `github.com/bendenty2/bendentremont.com`.
- Content unchanged this session: 4 heroes, **49 grid items** (14 medium / 14 portrait /
  18 landscape / 3 video). All photos are exactly 3:2 or 2:3.

---

## 2. What changed since the previous state file

Everything this session was **mobile-only** (gated to `@media (max-width: 700px)` +
`window.innerWidth <= 700` JS checks). Hard rule from the owner: **never alter the desktop
experience.** Desktop `renderGrid` / pattern / CSS are untouched.

**New mobile catalogue (`renderGridMobile` in `script.js`)** — a separate render path from the
desktop tiling pattern, branched at the top of `renderGrid` (`if (window.innerWidth <= 700)`):
- **2 columns**, photos at **native 3:2 / 2:3 — no cropping** (every photo is already a clean
  3:2 or 2:3, verified, so tiles self-align).
- **"4-small" interlock blocks**: 2 portraits + 2 landscapes emitted as `[L,P,P,L]`; CSS
  `grid-auto-flow: row dense` packs them so each block column = 1 portrait + 1 landscape →
  columns self-balance to equal height (clean rectangle, no fragile tuning).
- **Full-width "medium" bands** interleaved so no two ever stack. There are 14 mediums but only
  enough small content to space ~11, so **3 mediums are demoted to small landscapes**
  (`while (mediums.length > 11) landscapes.push(mediums.pop())`).
- **Videos dispersed** evenly through the landscape slots, ordered **beach → rewind_fire3 →
  fire3** via `VIDEO_ORDER`. (Desktop video order is still its fixed tile positions — not
  aligned to this; owner aware.)
- **Exact spacing knobs**: mobile grid uses **`grid-auto-rows: 1px`** (kills 4px quantization)
  so px values land true. In `renderGridMobile`: `CAP_OFFSET` (caption px below photo) and
  `TILE_GAP` (empty px gap below each tile). **`CAP_OFFSET` must match `.tile-caption`
  `margin-top` in the mobile CSS.** Current values: caption offset **5px**, tile gap **8px**.

**Mobile frame/margins:** `--grid-side-pad: 35px`; hero runs near-full-width (`16px`); footer
`--footer-height: 37px`; grid `margin-bottom: 24px` (trimmed bottom whitespace).

**Mobile grid videos:** source is 1920×1080 (16:9) with **~14.8% black bars each side** (real
content is 5:4). Shown in the 3:2 slots by scaling the `<video>` to `width: 143%`, **bottom-
anchored** (`bottom:0; left:50%; translateX(-50%)`) so the bars overflow/clip and the
bottom-right timestamp stays visible. The desktop `scaleX(1.28)` crop is overridden on mobile.

**About page (mobile):**
- Gear grid → single column, **Sigma first** (`order`), then R10, then SCL.
- **R10 clip** has **32.8% empty white space on top** (camera sits low). Cropped that top away
  with `clip-path: inset(30% 0 0 0)` + `margin-top: -13%` (proportional, holds across widths)
  so the camera tightens to its "Canon EOS R10" label without the white box covering it. (Earlier
  naïve `margin-top: -31px` hid the label — that's why the clip-path approach exists.)
- `.gear-col--r10 { margin-top: 5px }` (gap above R10), `.gear-video--scl { margin-top: -1px }`,
  `.gear-grid { margin-bottom: 14px }` (tighter to divider below).
- **GEAR / CONTACT subheads** bumped to **16px** (matching gear titles) and raised
  (`margin-top: -8px`).
- **Contact blurb left-aligned** (`.about-block--contact .about-text:first-of-type`); the
  "Contact" title and the email line stay centered.

**Site-wide (both desktop + mobile):**
- Nav label **"Pics" → "Photos"** (visible text only; `data-view="pics"` unchanged).
- Nav buttons: **removed the hover "swell"** (`transform: scale`), kept the color brighten.
- **View transition**: switching Photos↔About (and "Ben's Place" from About) now does a
  **seamless top-to-bottom fade** — `@keyframes viewReveal` (opacity + `clip-path: inset`),
  `backwards` fill so nothing lingers to clip tile-hover. Respected by the existing
  prefers-reduced-motion rule.
- Text copy: "only made this site" → "made this site only"; "Spotted a shot" → "See a shot".

**Deploy:** merged `dev` → `main` (`d570e67`), CNAME verified intact, production live ~60s.

---

## 3. Open items / known issues

- **Desktop video order** isn't aligned to the new mobile `beach → rewind_fire3 → fire3` order
  (desktop uses fixed tile positions). Owner aware; do separately if wanted (would need a
  manifest/tile reorder, since `build.py` regenerates `manifest.js`).
- **Caption readability vs. margins**: 2 columns at 35px side margins give ~155px columns;
  captions are 6px to fit on one line. Smaller margins = wider columns = bigger captions if the
  owner wants that lever.
- **`CAP_OFFSET` is duplicated** (JS `renderGridMobile` + CSS `.tile-caption margin-top`) — keep
  the two in sync when changing the caption offset.
- **Mobile video crop is geometry-tuned** (143%, bottom-anchored) to the measured 14.8% bars.
  If the source videos are ever re-encoded/recropped, re-check this. The robust long-term fix is
  to crop the bars out of the source files (would also let desktop drop its `scaleX` hack) — not
  done, since it touches the shared/desktop video path.
- Carried over: empty the Recycle Bin (~442 MB, OneDrive copy); `CLAUDE_CODE_BRIEF.md` + `state/`
  live on `main` (harmless markdown, not linked from the site).

---

## 4. Next steps (recommended)

1. **Test the new mobile layout across devices/widths** (it was iterated against the owner's
   phone screenshots) — especially the interlock blocks, video framing, and the About stack at
   different phone sizes.
2. **Continue mobile polish** as desired (spacing knobs are now explicit px in `renderGridMobile`
   + the mobile media query).
3. (Optional) Align desktop video order to mobile; revisit the source-video bar crop.

Reminder: develop on `dev`, merge to `main` to publish. **Mobile changes must never touch the
desktop experience.** Bump the footer version + `?v=` on `styles.css`/`script.js` on every
CSS/JS change (Cloudflare caches assets 4h; the query-string busts it).

---

## 5. Context worth keeping

- **Deploy is a MERGE, not a fast-forward** — `dev` and `main` have diverged. **`CNAME`
  (`bendentremont.com`) lives only on `main`** (`dev` branched before it was added and never
  touches it). `git checkout main && git merge dev` preserves it via 3-way merge, but **always
  `cat CNAME` after merging and before pushing.** GitHub Pages goes live ~60s after push. (Also
  in Claude Code project memory `dev-preview-hosting`.)
- **Mobile is a fully separate render path** (`renderGridMobile`), not the desktop
  `[M,H,F,F,H,M,H]` pattern. Desktop layout/CSS were deliberately left untouched all session.
- **Cache-busting**: `?v=<version>` on the `<link>`/`<script>` in `index.html`, bumped with the
  footer version, every CSS/JS change. Cloudflare ignores `_headers` Cache-Control for assets.
- **Two GitHub accounts on this machine**: `bendenty2` (this repo) and `aiceinc` (separate AICE
  project). Per-repo credential isolation via local `useHttpPath` — never set globally.
- **Why `manifest.js` not `.json`**: `fetch()` is blocked over `file://`; a JS global keeps the
  site openable as a local file with no server.
- **Brand/voice**: "Ben's Place"; minimalist, VSCO-inspired, wildlife/nature; humble-gear,
  patient-observation tone in About.
