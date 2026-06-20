/* ------------------------------------------------------------
   PhotoSite — main script.
   Loads window.PHOTOSITE_MANIFEST (from manifest.js), paints the
   masonry grid with EXIF captions, and wires up the lightbox
   (open, prev/next, keyboard nav, hover-preload).

   Supports both photo items (type: "photo" or no type field) and
   video items (type: "video").  Videos play muted everywhere — no audio.
   ------------------------------------------------------------ */

(() => {
  // ---------- View switching (pics / about) ----------
  // The sidebar buttons each carry a data-view attribute; clicking one
  // toggles which <section class="view"> is visible. The site always opens on
  // the Photos view (the HTML default) — the last tab is intentionally NOT
  // remembered across visits.

  const sidebarLinks = document.querySelectorAll(".nav-link[data-view]");

  function setActiveView(name) {
    document.querySelectorAll(".view").forEach(v => {
      v.classList.toggle("is-active", v.id === "view-" + name);
    });
    sidebarLinks.forEach(b => {
      b.classList.toggle("is-active", b.dataset.view === name);
    });
    // Gear videos live in the About section, which starts hidden — kick them
    // into playing once it's actually shown (muted autoplay can be deferred
    // while display:none).
    if (name === "about") {
      document.querySelectorAll(".gear-video").forEach(v => {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      });
    }
  }

  sidebarLinks.forEach(b => {
    b.addEventListener("click", () => setActiveView(b.dataset.view));
  });

  // Brand in the top-left returns to the top of the photo view.
  const brandBtn = document.querySelector(".topbar-brand");
  if (brandBtn) {
    brandBtn.addEventListener("click", () => {
      setActiveView("pics");
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }

  // Auto-update the footer year so we don't need to touch HTML each January.
  const footerYear = document.getElementById("footer-year");
  if (footerYear) footerYear.textContent = String(new Date().getFullYear());

  const heroSection       = document.getElementById("hero-section");
  const grid              = document.getElementById("grid");
  const lightbox          = document.getElementById("lightbox");
  const lightboxImg       = document.getElementById("lightbox-img");
  const lightboxVideo     = document.getElementById("lightbox-video");
  const lightboxVideoWrap = lightboxVideo ? lightboxVideo.parentElement : null;
  const lightboxTitle     = document.getElementById("lightbox-title");
  const lightboxExif      = document.getElementById("lightbox-exif");
  const lightboxClose     = lightbox.querySelector(".lightbox-close");
  const lightboxPrev      = lightbox.querySelector(".lightbox-nav--prev");
  const lightboxNext      = lightbox.querySelector(".lightbox-nav--next");

  // The full item array we're navigating through, in VISUAL order — used by
  // the lightbox for prev/next. renderGrid() rewrites this to match the order
  // tiles actually appear on screen.
  // The lightbox order is [heroes…, grid…]: the 4 hero photos are items 0–3,
  // the catalogue follows from index heroItems.length onward.
  let items = [];
  // The complete, unmodified item set (every photo + video). renderGrid() is
  // always fed from this so re-renders (resize) never lose tiles, even though
  // `items` above gets shrunk to the rendered subset.
  let allItems = [];
  // The hero/slideshow photos, prepended to `items` so they're clickable too.
  let heroItems = [];
  // Index of the currently-displayed item when the lightbox is open. -1 when closed.
  let currentIndex = -1;
  // Element that had focus before the lightbox opened, so we can restore it on close.
  let lastFocusedEl = null;

  // ---------- Caption ----------

  // Caption format: aperture | ISO | shutter | focal length, missing parts
  // skipped, joined with a pipe so it reads "f/8 | ISO 640 | 1/640s | 400mm".
  const CAPTION_SEP = " | ";

  function captionText(exif) {
    return [exif.aperture, exif.iso, exif.shutter, exif.focal]
      .filter(Boolean)
      .join(CAPTION_SEP);
  }

  function buildCaption(text) {
    const div = document.createElement("div");
    div.className = "tile-caption";
    div.textContent = text;
    return div;
  }

  // ---------- Hover-preload (photos only) ----------
  // Kick off the full-size image download when a tile is first hovered so
  // clicking it opens the lightbox instantly. Dedupe by URL.
  const preloaded = new Set();
  function preloadFull(item) {
    if (!item || item.type === "video" || !item.full || preloaded.has(item.full)) return;
    preloaded.add(item.full);
    const img = new Image();
    img.src = item.full;
  }

  // ---------- Tiles ----------

  function buildPhotoTile(item, index) {
    const tile = document.createElement("figure");
    tile.className = "tile";
    tile.dataset.id = item.id;

    const img = document.createElement("img");
    img.src = item.thumbnail;
    img.alt = item.title || item.id;
    img.loading = "lazy";
    if (item.width && item.height) {
      img.width = item.width;
      img.height = item.height;
    }

    tile.appendChild(img);
    tile.appendChild(buildCaption(captionText(item.exif || {})));

    tile.addEventListener("click", () => openLightboxAt(index));
    tile.addEventListener("mouseenter", () => preloadFull(item), { once: true });
    return tile;
  }

  function buildVideoTile(item, index) {
    const tile = document.createElement("figure");
    tile.className = "tile tile--video";
    tile.dataset.id = item.id;

    const video = document.createElement("video");
    video.src = item.src;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    // Load metadata only so we know dimensions/duration without pulling the
    // entire file — the browser will buffer the rest for autoplay.
    video.preload = "metadata";

    // Wrap the video so CSS can crop the pillarbox bars via overflow:hidden.
    const cropWrap = document.createElement("div");
    cropWrap.className = "video-crop-wrapper";
    cropWrap.appendChild(video);

    tile.appendChild(cropWrap);
    tile.appendChild(buildCaption(item.title || ""));

    tile.addEventListener("click", () => openLightboxAt(index));
    return tile;
  }

  function buildTile(item, index) {
    return item.type === "video"
      ? buildVideoTile(item, index)
      : buildPhotoTile(item, index);
  }

  // ---------- Column-count ----------

  function getColumnCount() {
    // Same 3-column masonry pattern on every screen. On phones the tiles just
    // get smaller — tap a photo for the full-size view.
    return 3;
  }

  // ---------- Pattern-based grid layout ─────────────────────────────────────
  // The grid tiles in a repeating 7-item pattern: [M, H, F, F, H, M, H]
  //
  //   M = medium landscape  (span 2, total height 2U) — from medium_photos/
  //   H = half landscape    (span 1, total height  U) — small landscape or video
  //   F = full portrait     (span 1, total height 2U) — small portrait
  //
  // Visualised (3 columns, rows = U-height units):
  //
  //   ┌──────────────┬───────┐
  //   │      M       │   H   │   ← rows 1-2
  //   │      M       ├───────┤
  //   │              │   F   │   ← rows 2-3
  //   ├───────┬───────┤       │
  //   │   F   │   H   │   F   │   ← rows 3-4
  //   │   F   ├───────┴───────┤
  //   │       │      M       │   ← rows 4-5
  //   ├───────┤      M       │
  //   │   H   │              │   ← row 5
  //   └───────┴──────────────┘
  //
  // U is derived from the first medium photo in each group:
  //   medTotalH = (2*colW + colGap) * medAR + CAPTION_H_PHOTO
  //   U_rows    = Math.round(medTotalH / 2 / ROW_PX)
  //
  // Because every span is an exact integer multiple of U_rows (never
  // independently rounded per tile), there is zero rounding drift between
  // columns — the pattern tiles with no whitespace.
  //
  // Half-height photo tiles (small landscapes) get align-self: center so any
  // sub-pixel slack is split symmetrically above and below, matching the
  // visual centering already applied to video tiles.

  const ROW_PX           = 4;    // must match grid-auto-rows in CSS
  const CAPTION_H_PHOTO  = 19;   // photo caption visual height including margins
  const CAPTION_H_VIDEO  = 18;   // video empty-caption height (margins only)
  const VIDEO_CROP_RATIO = 1.5;  // 3:2 — matches CSS aspect-ratio on .video-crop-wrapper
  const GAP_PX           = 8;    // spacing tuner between groups (increase = more space)

  // Per-position padding as a FRACTION of (U_rows × ROW_PX) within each
  // group's 7-item sequence.  Using fractions rather than absolute pixels
  // means the corrections scale automatically with tile height — so the
  // layout stays correct at any viewport width or browser zoom level.
  // Positions: 0=M0, 1=H1, 2=F0, 3=F1, 4=H4, 5=M1, 6=H6
  // Actual px at render time = Math.round(fraction × U_rows × ROW_PX).
  const TILE_PADDING = [  0.000,   0.000,  -0.048,  -0.161,  -0.097,  -0.065,  -0.177];  // M0 H1 F0 F1 H4 M1 H6

  // Fraction of U_rows to trim from the row-spans of the last two tiles per
  // group (M1 at groupPos 5, H6 at groupPos 6).  The negative TILE_PADDING
  // translations pull those tiles up visually without releasing their grid
  // rows — trimming the spans closes the resulting gap before the next group.
  // Stored as a fraction of U_rows (not absolute rows) so it scales with
  // tile height at any viewport width.
  // Actual rows trimmed = Math.round(fraction × U_rows).
  const GROUP_END_TRIM = 0.220;

  function getGridMetrics(cols) {
    const style  = getComputedStyle(grid);
    const padL   = parseFloat(style.paddingLeft)  || 0;
    const padR   = parseFloat(style.paddingRight) || 0;
    const colGap = parseFloat(style.columnGap)    || 16;
    const inner  = (grid.clientWidth || window.innerWidth) - padL - padR;
    const colW   = (inner - colGap * (cols - 1)) / cols;
    return { colW, colGap };
  }

  // Fallback span formula used only for leftover items that don't fit
  // into a complete pattern group.
  function tileRowSpan(item, colW, colGap) {
    const span     = item.span || 1;
    const displayW = colW * span + colGap * (span - 1);
    let imgH;
    if (item.type === "video") {
      imgH = displayW / VIDEO_CROP_RATIO;
    } else if (item.width && item.height) {
      imgH = displayW * item.height / item.width;
    } else {
      imgH = displayW;
    }
    return Math.round((imgH + CAPTION_H_PHOTO) / ROW_PX) + 2;
  }

  // ---------- Mobile grid ----------
  // Phones get a simpler 2-column layout instead of the desktop tiling pattern.
  // Every photo keeps its native 3:2 / 2:3 aspect (no cropping). Tiles are laid
  // out as "4-small" interlock blocks (2 portraits + 2 landscapes — each column
  // is one portrait + one landscape, so the two columns self-balance to equal
  // height) and full-width "medium" bands, interleaved so no two mediums ever
  // stack. Videos are dispersed evenly through the landscape slots and shown at
  // 3:2 like a small landscape. Relies on `grid-auto-flow: row dense` (set in
  // CSS) to pack the interlock.
  function renderGridMobile(list) {
    grid.innerHTML = "";
    grid.style.setProperty("--cols", 2);
    grid.dataset.cols = 2;
    const { colW, colGap } = getGridMetrics(2);
    // Tunable vertical-spacing knobs (px). Mobile grid-auto-rows is 1px (see the
    // mobile CSS) so these land near-exactly. CAP_OFFSET must match the
    // .tile-caption margin-top in the mobile media query.
    const MROW       = 1;    // px per grid row on mobile
    const CAP_OFFSET = 5;    // caption sits this far below its photo
    const CAP_TEXT   = 8;    // caption text line height (~6px font)
    const TILE_GAP   = 8;    // empty gap below each tile, before the next one
    const reserve    = CAP_OFFSET + CAP_TEXT + TILE_GAP;

    const mediums = [], portraits = [], landscapes = [], videos = [];
    list.forEach(it => {
      if (it.type === "video") videos.push(it);
      else if (it.span === 2) mediums.push(it);
      else if (!it.width || !it.height || it.height > it.width) portraits.push(it);
      else landscapes.push(it);
    });

    // (Videos keep their manifest/layout.txt order; they're dispersed through
    // the landscape slots below in that order.)

    // Too many full-width mediums to space out in 2 columns — demote the extras
    // to small single-column landscapes so none end up stacked.
    while (mediums.length > 11) landscapes.push(mediums.pop());

    // Disperse the videos evenly through the landscape stream.
    const land = landscapes.slice();
    videos.forEach((v, k) => {
      const pos = Math.round((k + 1) / (videos.length + 1) * (land.length + 1));
      land.splice(Math.max(0, Math.min(pos, land.length)), 0, v);
    });

    // Small-content groups: 4-small interlock blocks (emit order L P P L), then
    // any leftover landscapes as side-by-side pairs.
    const smalls = [];
    let li = 0, pi = 0;
    while (pi + 1 < portraits.length && li + 1 < land.length) {
      smalls.push([land[li], portraits[pi], portraits[pi + 1], land[li + 1]]);
      li += 2; pi += 2;
    }
    while (li + 1 < land.length) { smalls.push([land[li], land[li + 1]]); li += 2; }

    // Interleave: small group, medium, small group, medium, …
    const seq = [];
    let mi = 0;
    smalls.forEach(group => {
      group.forEach(it => seq.push({ item: it, span2: false }));
      if (mi < mediums.length) seq.push({ item: mediums[mi++], span2: true });
    });
    while (mi < mediums.length) seq.push({ item: mediums[mi++], span2: true });
    while (li < land.length)      seq.push({ item: land[li++], span2: false });
    while (pi < portraits.length) seq.push({ item: portraits[pi++], span2: false });

    items = heroItems.concat(seq.map(e => e.item));

    seq.forEach(({ item, span2 }, i) => {
      const tile = buildTile(item, heroItems.length + i);
      tile.style.gridColumn = span2 ? "span 2" : "span 1";
      const dispW = span2 ? (colW * 2 + colGap) : colW;
      const imgH  = item.type === "video"
        ? dispW / VIDEO_CROP_RATIO            // videos shown at 3:2
        : dispW * item.height / item.width;   // photos at native aspect
      // Reserve image + caption + gap. The same reserve on every tile keeps a
      // block's two columns equal height.
      tile.style.gridRowEnd = `span ${Math.max(1, Math.ceil((imgH + reserve) / MROW))}`;
      grid.appendChild(tile);
    });
  }

  function renderGrid(list) {
    if (window.innerWidth <= 700) { renderGridMobile(list); return; }
    const cols = getColumnCount();
    grid.innerHTML = "";
    grid.style.setProperty("--cols", cols);
    grid.dataset.cols = cols;

    const { colW, colGap } = getGridMetrics(cols);
    const medDisplayW = colW * 2 + colGap;  // display width of a span-2 tile

    // ── Categorize items ──────────────────────────────────────────────────
    // Videos are kept in their own bucket so they can be placed precisely.
    // Photos are split by orientation: portrait → "full", landscape → "halfPhoto".
    const buckets = { medium: [], full: [], halfPhoto: [], video: [] };
    list.forEach((item, origIdx) => {
      let bucket;
      if (item.span === 2) {
        bucket = "medium";
      } else if (item.type === "video") {
        bucket = "video";
      } else if (!item.width || !item.height || item.height > item.width) {
        bucket = "full";       // portrait small
      } else {
        bucket = "halfPhoto";  // landscape small
      }
      buckets[bucket].push({ item, origIdx });
    });

    // ── Find how many complete groups we can fill ─────────────────────────
    // Pattern: [M, H, F, F, H, M, H]  (7 items per group)
    //   Even groups (0, 2, 4, …): 3 halfPhoto + 0 video
    //   Odd  groups (1, 3, 5, …): 2 halfPhoto + 1 video  (video at center)
    //
    // For g groups:
    //   halfPhoto needed = ceil(g/2)*3 + floor(g/2)*2
    //   video     needed = floor(g/2)
    const maxByMedFull = Math.floor(Math.min(
      buckets.medium.length   / 2,
      buckets.full.length     / 2
    ));
    let groups = 0;
    for (let g = maxByMedFull; g >= 0; g--) {
      const hNeed = Math.ceil(g / 2) * 3 + Math.floor(g / 2) * 2;
      const vNeed = Math.floor(g / 2);
      if (hNeed <= buckets.halfPhoto.length && vNeed <= buckets.video.length) {
        groups = g;
        break;
      }
    }

    const renderGroups = groups;

    const sequence = [];
    let halfIdx  = 0;
    let videoIdx = 0;

    for (let g = 0; g < renderGroups; g++) {
      // Odd groups place a video at the center H slot; even groups use a photo.
      const isVideoGroup = (g % 2 === 1);

      // ── Compute U: the minimum half-unit that fits every tile without
      //    clipping.  We peek at all items before consuming any indices.
      //
      //    2U tiles (medium + portrait): need  2U ≥ contentH  →  U ≥ contentH/2
      //    1U tiles (landscape + video): need   U ≥ contentH
      //
      //    After finding the tightest bound we add the group-specific gap so the
      //    hover swell never touches the neighbouring tile.  Math.ceil guarantees
      //    nothing is clipped.
      const med0  = buckets.medium   [g * 2    ].item;
      const med1  = buckets.medium   [g * 2 + 1].item;
      const port0 = buckets.full     [g * 2    ].item;
      const port1 = buckets.full     [g * 2 + 1].item;
      const ph1   = buckets.halfPhoto[halfIdx                       ]?.item; // pos 1
      const ph4   = isVideoGroup ? buckets.video[videoIdx]?.item             // pos 4 (video, peek)
                                 : buckets.halfPhoto[halfIdx + 1]?.item;    // pos 4 (photo)
      const ph6   = buckets.halfPhoto[halfIdx + (isVideoGroup ? 1 : 2)]?.item; // pos 6

      // Total pixel height of a tile displayed at the given width.
      const ph2U = (item, dispW) => {
        if (!item || !item.width || !item.height) return dispW * (2/3) + CAPTION_H_PHOTO;
        return dispW * item.height / item.width + CAPTION_H_PHOTO;
      };
      const ph1U = (item) => {
        if (!item) return 0;
        if (item.type === "video") return colW / VIDEO_CROP_RATIO + CAPTION_H_VIDEO;
        if (!item.width || !item.height) return colW * (2/3) + CAPTION_H_PHOTO;
        return colW * item.height / item.width + CAPTION_H_PHOTO;
      };

      const U_content = Math.max(
        ph2U(med0,  medDisplayW) / 2,   // medium needs 2U ≥ its height
        ph2U(med1,  medDisplayW) / 2,
        ph2U(port0, colW)        / 2,   // portrait needs 2U ≥ its height
        ph2U(port1, colW)        / 2,
        ph1U(ph1),                       // half-photo at pos 1
        ph1U(ph4),                       // video or half-photo at pos 4
        ph1U(ph6),                       // half-photo at pos 6
      );
      const gapPx  = GAP_PX;
      const U_rows = Math.max(1, Math.ceil((U_content + gapPx) / ROW_PX));

      // ── Consume items (advance bucket indices) ──────────────────────────
      const h1 = { ...buckets.halfPhoto[halfIdx++], role: "half", U_rows };
      const h4 = isVideoGroup
        ? { ...buckets.video    [videoIdx++], role: "half", U_rows }
        : { ...buckets.halfPhoto[halfIdx++],  role: "half", U_rows };
      const h6 = { ...buckets.halfPhoto[halfIdx++], role: "half", U_rows };

      // groupPos 0-6 maps to: M0, H1, F0, F1, H4/H4v, M1, H6
      [
        { ...buckets.medium[g * 2],     role: "medium", U_rows, groupPos: 0, isVideoGroup },
        { ...h1,                                                  groupPos: 1, isVideoGroup },
        { ...buckets.full  [g * 2],     role: "full",   U_rows, groupPos: 2, isVideoGroup },
        { ...buckets.full  [g * 2 + 1], role: "full",   U_rows, groupPos: 3, isVideoGroup },
        { ...h4,                                                  groupPos: 4, isVideoGroup },
        { ...buckets.medium[g * 2 + 1], role: "medium", U_rows, groupPos: 5, isVideoGroup },
        { ...h6,                                                  groupPos: 6, isVideoGroup },
      ].forEach(e => sequence.push(e));
    }

    // Append any leftover items that didn't fill a complete pattern group.
    [
      ...buckets.medium  .slice(groups * 2),
      ...buckets.full    .slice(groups * 2),
      ...buckets.halfPhoto.slice(halfIdx),
      ...buckets.video   .slice(videoIdx),
    ].forEach(entry => sequence.push({ ...entry, role: "leftover", U_rows: null }));

    // ── Update global items array to match visual order ───────────────────
    // Heroes are lightbox items 0..N-1; the grid follows.
    items = heroItems.concat(sequence.map(e => e.item));

    // ── Render tiles ───────────────────────────────────────────────────────
    sequence.forEach(({ item, role, U_rows, groupPos, isVideoGroup }, seqIdx) => {
      const tile = buildTile(item, heroItems.length + seqIdx);

      // groupPos 5 (M1) and 6 (H6) are the bottom tiles of every group.
      // Trim their row spans to close the visual gap that negative TILE_PADDING
      // translations create (tiles move up but grid rows stay allocated).
      // trimRows scales with U_rows so the correction stays proportional at
      // any viewport width or zoom level.
      // Desktop only: the trim closes a gap created by the negative TILE_PADDING
      // nudges. On mobile tiles cover-fill, so we skip both nudges and trim.
      const trimRows = (window.innerWidth > 700 && (groupPos === 5 || groupPos === 6))
        ? Math.round((GROUP_END_TRIM || 0) * U_rows)
        : 0;

      if (role === "medium") {
        tile.style.gridColumn = "span 2";
        tile.style.gridRowEnd = `span ${2 * U_rows - trimRows}`;
      } else if (role === "full") {
        tile.style.gridColumn = "span 1";
        tile.style.gridRowEnd = `span ${2 * U_rows}`;
      } else if (role === "half") {
        tile.style.gridColumn = "span 1";
        tile.style.gridRowEnd = `span ${Math.max(1, U_rows - trimRows)}`;
        if (item.type !== "video") tile.classList.add("tile--half");
      } else {
        // Leftover: old per-item formula as a safe fallback.
        const span = item.span || 1;
        tile.style.gridColumn = `span ${span}`;
        tile.style.gridRowEnd = `span ${tileRowSpan(item, colW, colGap)}`;
      }

      // Per-position vertical nudge: TILE_PADDING fractions scaled by U_rows so
      // they hold at any viewport width. Desktop only — mobile cover-fills its
      // tiles (no slack), so no nudge is needed.
      let appliedPadPx = 0;
      if (groupPos !== undefined && window.innerWidth > 700) {
        const frac = TILE_PADDING[groupPos] ?? 0;
        appliedPadPx = frac ? Math.round(frac * U_rows * ROW_PX) : 0;
      }
      if (appliedPadPx) {
        tile.style.transform = `translateY(${appliedPadPx}px)`;
      }

      grid.appendChild(tile);
    });
  }

  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  function onResize() {
    // The masonry layout depends only on the viewport WIDTH. Ignore height-only
    // resizes — notably the mobile address bar showing/hiding as you scroll —
    // otherwise rebuilding the grid mid-scroll yanks you back to the top.
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      requestAnimationFrame(() => renderGrid(allItems));
    }, 120);
  }
  window.addEventListener("resize", onResize);

  // ---------- Lightbox ----------

  function stopLightboxVideo() {
    if (!lightboxVideo) return;
    lightboxVideo.pause();
    lightboxVideo.src = "";
  }

  function showLightboxItem(item) {
    const isVideo = item.type === "video";

    // Toggle which media element is visible.
    lightboxImg.style.display = isVideo ? "none" : "";
    if (lightboxVideoWrap) {
      lightboxVideoWrap.classList.toggle("is-active", isVideo);
    }

    if (isVideo) {
      // Stop any previously playing video before swapping src.
      lightboxVideo.pause();
      lightboxVideo.src = item.src;
      lightboxVideo.muted = true;   // videos have no audio
      lightboxVideo.play().catch(() => {
        // Autoplay blocked — not critical; user can hit play manually.
      });
    } else {
      // Photo path.
      stopLightboxVideo();
      lightboxImg.src = item.full;
      lightboxImg.alt = item.title || item.id;

      // Eagerly preload neighbours so the next/prev press is instant too.
      const n = items.length;
      if (n > 1) {
        preloadFull(items[(currentIndex + 1) % n]);
        preloadFull(items[(currentIndex - 1 + n) % n]);
      }
    }

    lightboxTitle.textContent = item.title || "";
    lightboxExif.textContent  = isVideo ? "" : captionText(item.exif || {});
    updateNavArrows();
  }

  // Bounded gallery: hide the left arrow on the first item and the right arrow
  // on the last — there's nothing to scroll to past either end.
  function updateNavArrows() {
    lightboxPrev.classList.toggle("is-hidden", currentIndex <= 0);
    lightboxNext.classList.toggle("is-hidden", currentIndex >= items.length - 1);
  }

  function openLightboxAt(index) {
    if (!items.length) return;
    lastFocusedEl = document.activeElement;
    currentIndex = ((index % items.length) + items.length) % items.length;
    showLightboxItem(items[currentIndex]);
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard/screen-reader users start inside it.
    if (lightboxClose) lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.src = "";
    stopLightboxVideo();
    currentIndex = -1;
    document.body.style.overflow = "";
    // Return focus to wherever it was before the lightbox opened.
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus();
    }
    lastFocusedEl = null;
  }

  function step(delta) {
    if (currentIndex < 0 || !items.length) return;
    const next = currentIndex + delta;
    if (next < 0 || next >= items.length) return;   // bounded — no wrap-around
    currentIndex = next;
    showLightboxItem(items[currentIndex]);
  }

  // Click the dim overlay (but not the inner content) to close.
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  lightboxClose.addEventListener("click", closeLightbox);
  lightboxPrev.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
  lightboxNext.addEventListener("click", (e) => { e.stopPropagation(); step(1); });

  // Visible, focusable controls inside the lightbox.
  function getLightboxFocusables() {
    return [lightboxClose, lightboxPrev, lightboxNext]
      .filter(el => el && el.offsetParent !== null && !el.classList.contains("is-hidden"));
  }

  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape")          closeLightbox();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft")  step(-1);
    else if (e.key === "Tab") {
      // Trap Tab focus within the dialog so it can't reach the page behind it.
      const focusables = getLightboxFocusables();
      if (!focusables.length) return;
      const first  = focusables[0];
      const last   = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !lightbox.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !lightbox.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // ---------- Hero slideshow ----------

  const HERO_INTERVAL_MS = 5000;   // ms between auto-advances
  let heroSlides   = [];            // { item, img, dot } per hero photo
  let heroActiveIdx = 0;
  let heroTimer    = null;
  let heroExifEl   = null;          // cached #hero-exif element (set on build)

  function updateHeroExif(item) {
    if (!heroExifEl) return;
    // Fade out → swap text → fade in.
    heroExifEl.style.opacity = "0";
    setTimeout(() => {
      heroExifEl.textContent = captionText(item.exif || {});
      heroExifEl.style.opacity = "1";
    }, 200);
  }

  function showHeroSlide(index) {
    const n = heroSlides.length;
    if (!n) return;
    heroActiveIdx = ((index % n) + n) % n;
    heroSlides.forEach((s, i) => {
      s.img.classList.toggle("is-active", i === heroActiveIdx);
      if (s.dot) s.dot.classList.toggle("is-active", i === heroActiveIdx);
    });
    updateHeroExif(heroSlides[heroActiveIdx].item);
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function startHeroTimer() {
    clearInterval(heroTimer);
    // Respect the OS "reduce motion" setting: no auto-advance for those users
    // (the dots remain for manual navigation).
    if (prefersReducedMotion()) return;
    if (heroSlides.length > 1) {
      heroTimer = setInterval(
        () => showHeroSlide(heroActiveIdx + 1),
        HERO_INTERVAL_MS
      );
    }
  }

  function buildHeroSlideshow(heroes) {
    if (!heroes.length || !heroSection) return;

    const slideshow = document.createElement("div");
    slideshow.className = "hero-slideshow";
    // Click the hero photo to open it in the lightbox (then arrow on into the
    // rest of the catalogue). Uses the currently-shown slide's index.
    slideshow.addEventListener("click", () => openLightboxAt(heroActiveIdx));

    const dotsEl = document.createElement("div");
    dotsEl.className = "hero-dots";

    const exifEl = document.createElement("div");
    exifEl.id = "hero-exif";
    exifEl.className = "hero-exif";
    heroExifEl = exifEl;

    heroes.forEach((h, i) => {
      const img = document.createElement("img");
      img.src     = h.full;
      img.alt     = h.title || `Featured photo ${i + 1}`;
      img.className = "hero-img";
      img.loading   = i === 0 ? "eager" : "lazy";
      slideshow.appendChild(img);

      let dot = null;
      if (heroes.length > 1) {
        dot = document.createElement("button");
        dot.type = "button";
        dot.className = "hero-dot";
        dot.setAttribute("aria-label", `Show photo ${i + 1}`);
        dot.addEventListener("click", () => {
          showHeroSlide(i);
          startHeroTimer();   // reset the auto-advance timer on manual nav
        });
        dotsEl.appendChild(dot);
      }

      heroSlides.push({ item: h, img, dot });
    });

    heroSection.appendChild(slideshow);
    if (heroes.length > 1) heroSection.appendChild(dotsEl);
    heroSection.appendChild(exifEl);
    heroSection.style.display = "";

    showHeroSlide(0);
    startHeroTimer();
  }

  // ---------- Boot ----------
  // The manifest is loaded via <script src="manifest.js"></script> in
  // index.html, which assigns to window.PHOTOSITE_MANIFEST. This works
  // when the page is opened directly via file:// (where fetch() is blocked).

  const manifest = window.PHOTOSITE_MANIFEST;
  if (!manifest) {
    grid.innerHTML =
      `<p style="color:#999;font-size:13px;text-align:center;` +
      `padding:48px 16px">manifest.js not found — run <code>python build.py</code> first.</p>`;
  } else {
    // Build hero slideshow — prefer the new heroes[] array, fall back to
    // the legacy hero object so older manifests still work.
    const heroList = manifest.heroes && manifest.heroes.length
      ? manifest.heroes
      : (manifest.hero ? [manifest.hero] : []);
    heroItems = heroList;
    buildHeroSlideshow(heroList);

    allItems = manifest.photos || [];
    items = heroItems.concat(allItems);

    // Defer one frame so the grid has been laid out by the browser and
    // grid.clientWidth returns an accurate value for the row-span maths.
    requestAnimationFrame(() => renderGrid(allItems));
  }

})();
