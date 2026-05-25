/* ------------------------------------------------------------
   PhotoSite — main script.
   Loads window.PHOTOSITE_MANIFEST (from manifest.js), paints the
   masonry grid with EXIF captions, and wires up the lightbox
   (open, prev/next, keyboard nav, hover-preload).

   Supports both photo items (type: "photo" or no type field) and
   video items (type: "video").  Videos autoplay muted in the grid;
   audio is available via a toggle when a video is expanded in the
   lightbox.
   ------------------------------------------------------------ */

(() => {
  // ---------- View switching (pics / about) ----------
  // The sidebar buttons each carry a data-view attribute; clicking one
  // toggles which <section class="view"> is visible. The choice is
  // remembered so reloads land you back on the same tab.

  const VIEW_NAME_KEY = "photosite.activeView";
  const sidebarLinks = document.querySelectorAll(".nav-link[data-view]");

  function setActiveView(name) {
    document.querySelectorAll(".view").forEach(v => {
      v.classList.toggle("is-active", v.id === "view-" + name);
    });
    sidebarLinks.forEach(b => {
      b.classList.toggle("is-active", b.dataset.view === name);
    });
    try { localStorage.setItem(VIEW_NAME_KEY, name); } catch (e) {}
  }

  sidebarLinks.forEach(b => {
    b.addEventListener("click", () => setActiveView(b.dataset.view));
  });

  // Restore last view choice from previous visit.
  try {
    const saved = localStorage.getItem(VIEW_NAME_KEY);
    if (saved === "pics" || saved === "about") setActiveView(saved);
  } catch (e) { /* private mode — ignore */ }

  // Auto-update the footer year so we don't need to touch HTML each January.
  const footerYear = document.getElementById("footer-year");
  if (footerYear) footerYear.textContent = String(new Date().getFullYear());

  const heroSection       = document.getElementById("hero-section");
  const grid              = document.getElementById("grid");
  const lightbox          = document.getElementById("lightbox");
  const lightboxImg       = document.getElementById("lightbox-img");
  const lightboxVideo     = document.getElementById("lightbox-video");
  const lightboxVideoWrap = lightboxVideo ? lightboxVideo.parentElement : null;
  const lightboxAudioBtn  = document.getElementById("lightbox-audio-toggle");
  const lightboxTitle     = document.getElementById("lightbox-title");
  const lightboxExif      = document.getElementById("lightbox-exif");
  const lightboxClose     = lightbox.querySelector(".lightbox-close");
  const lightboxPrev      = lightbox.querySelector(".lightbox-nav--prev");
  const lightboxNext      = lightbox.querySelector(".lightbox-nav--next");

  // The full item array we're navigating through. Set after manifest loads.
  let items = [];
  // Index of the currently-displayed item when the lightbox is open. -1 when closed.
  let currentIndex = -1;
  // Whether the lightbox video is currently muted.
  let lightboxMuted = true;

  // Dev mode state — managed by the dev mode section at the bottom.
  let devMode    = false;
  let devDrag    = null;   // active drag: { tileEl, startClientY, startPadding }
  // (snap guides removed — dev mode now uses 4 px grid snap)
  const devMeta  = new WeakMap();  // tileEl → { groupPos }
  // Live padding values tracked while dragging; indexed by [groupPos].
  // Seeded from the last non-dev render's actual pixel values (see lastRenderedPadding).
  const devOffsets = [0, 0, 0, 0, 0, 0, 0];

  // Pixel offsets actually applied in the most recent renderGrid call,
  // indexed by [groupPos].  Used to seed devOffsets so dragging always
  // starts from the current visible state.
  let lastRenderedPadding = [0, 0, 0, 0, 0, 0, 0];
  // U_rows value from the most recent render — used by recordPositions() to
  // convert absolute-px devOffsets back to fractions.
  let lastRenderedU = 68;

  // Gap between the reference group and its mirror (in ROW_PX-sized rows).
  // Seeded from GROUP_END_TRIM × lastRenderedU when dev mode is entered.
  let devGapRows   = 0;   // seeded from GROUP_END_TRIM × lastRenderedU when dev mode is entered
  let devGapHandle = null;   // the gap handle DOM element (refreshed each render)
  let devGapDrag   = null;   // active gap drag: { startClientY, startGapRows }
  // Mirror tiles for the copy group: parallel to devOffsets by groupPos.
  const devCopyTiles = [null, null, null, null, null, null, null];

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
    const w = window.innerWidth;
    if (w <= 700) return 2;
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
  // Fallback when SEQUENCE_PADDING is empty.
  const TILE_PADDING = [  0.000,   0.000,  -0.048,  -0.161,  -0.097,  -0.065,  -0.177];  // M0 H1 F0 F1 H4 M1 H6

  // Per-tile padding (px) recorded directly from dev mode with real photos.
  // When non-empty this takes priority over TILE_PADDING.
  // Note: these are absolute pixels — they don't scale with viewport width.
  // Prefer keeping this empty and tuning TILE_PADDING fractions instead.
  // Paste updated values here after hitting RECORD in dev mode (at full screen).
  const SEQUENCE_PADDING = [];

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

  function renderGrid(list) {
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

    // In dev mode only render the first group so the user sees exactly what
    // they're tuning — since video and photo tiles now share the same 3:2
    // shape, one group calibrates all groups.
    const renderGroups = devMode ? Math.min(groups, 1) : groups;

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

    // Append leftover items only in normal mode — dev mode shows just the two template groups.
    if (!devMode) {
      [
        ...buckets.medium  .slice(groups * 2),
        ...buckets.full    .slice(groups * 2),
        ...buckets.halfPhoto.slice(halfIdx),
        ...buckets.video   .slice(videoIdx),
      ].forEach(entry => sequence.push({ ...entry, role: "leftover", U_rows: null }));
    }

    // ── Update global items array to match visual order ───────────────────
    items = sequence.map(e => e.item);

    // ── Render tiles ───────────────────────────────────────────────────────
    sequence.forEach(({ item, role, U_rows, groupPos, isVideoGroup }, seqIdx) => {
      const tile = buildTile(item, seqIdx);

      // groupPos 5 (M1) and 6 (H6) are the bottom tiles of every group.
      // Trim their row spans to close the visual gap that negative TILE_PADDING
      // translations create (tiles move up but grid rows stay allocated).
      // trimRows scales with U_rows so the correction stays proportional at
      // any viewport width or zoom level.
      const trimRows = (groupPos === 5 || groupPos === 6)
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

      // Padding priority:
      //   1. devOffsets       — live values while dev mode is active
      //   2. SEQUENCE_PADDING — per-tile values recorded from a previous dev session
      //   3. TILE_PADDING     — fractional fallback (scales with U_rows)
      let appliedPadPx = 0;
      if (devMode && groupPos !== undefined) {
        appliedPadPx = devOffsets[groupPos] || 0;
      } else if (SEQUENCE_PADDING.length > 0) {
        appliedPadPx = SEQUENCE_PADDING[seqIdx] || 0;
      } else if (groupPos !== undefined) {
        const frac = TILE_PADDING[groupPos] ?? 0;
        appliedPadPx = frac ? Math.round(frac * U_rows * ROW_PX) : 0;
      }
      if (appliedPadPx) {
        tile.style.transform = `translateY(${appliedPadPx}px)`;
      }
      tile.dataset.tTranslate = String(appliedPadPx);

      // Track rendered offsets so dev mode can be seeded from the live state.
      if (groupPos !== undefined) {
        lastRenderedPadding[groupPos] = appliedPadPx;
        lastRenderedU = U_rows;
      }

      // Dev mode: attach drag listener (pattern tiles only).
      if (devMode && groupPos !== undefined) {
        setupDevTile(tile, groupPos);
      }

      grid.appendChild(tile);
    });

    // ── Dev mode: gap handle + mirror group ──────────────────────────────
    // After rendering group 0, append a draggable gap handle (whose row-span
    // records the GROUP_END_TRIM gap), then a dimmed copy of group 0 that
    // mirrors devOffsets live so you can see how the next group sits.
    if (devMode && sequence.length > 0) {
      // Gap handle ─ full-width, height = devGapRows × ROW_PX.
      devGapHandle = document.createElement('div');
      devGapHandle.className = 'dev-gap-handle';
      devGapHandle.style.gridColumn = `1 / -1`;
      devGapHandle.style.gridRowEnd = `span ${Math.max(1, devGapRows)}`;
      devGapHandle.addEventListener('mousedown', onGapMouseDown);
      grid.appendChild(devGapHandle);

      // Mirror group: same items, same spans, same devOffset translations.
      sequence.forEach(({ item, role, U_rows, groupPos, isVideoGroup }, seqIdx) => {
        if (groupPos === undefined) return;
        const copy = buildTile(item, seqIdx);
        const trimRows = (groupPos === 5 || groupPos === 6)
          ? Math.round((GROUP_END_TRIM || 0) * U_rows) : 0;
        if (role === 'medium') {
          copy.style.gridColumn = 'span 2';
          copy.style.gridRowEnd = `span ${2 * U_rows - trimRows}`;
        } else if (role === 'full') {
          copy.style.gridColumn = 'span 1';
          copy.style.gridRowEnd = `span ${2 * U_rows}`;
        } else if (role === 'half') {
          copy.style.gridColumn = 'span 1';
          copy.style.gridRowEnd = `span ${Math.max(1, U_rows - trimRows)}`;
          if (item.type !== 'video') copy.classList.add('tile--half');
        }
        const pad = devOffsets[groupPos] || 0;
        if (pad) copy.style.transform = `translateY(${pad}px)`;
        copy.dataset.tTranslate = String(pad);
        copy.classList.add('dev-copy-tile');
        devCopyTiles[groupPos] = copy;
        grid.appendChild(copy);
      });
    }
  }

  let resizeTimer = null;
  let lastCols = -1;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = getColumnCount();
      if (next !== lastCols) {
        lastCols = next;
        requestAnimationFrame(() => renderGrid(items));
      } else {
        // Column count unchanged but widths may have shifted — re-calc spans.
        requestAnimationFrame(() => renderGrid(items));
      }
    }, 120);
  }
  window.addEventListener("resize", onResize);

  // ---------- Lightbox ----------

  function stopLightboxVideo() {
    if (!lightboxVideo) return;
    lightboxVideo.pause();
    lightboxVideo.src = "";
    // Reset audio state for next open.
    lightboxMuted = true;
    if (lightboxAudioBtn) lightboxAudioBtn.textContent = "unmute";
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
      lightboxVideo.muted = lightboxMuted;
      lightboxVideo.play().catch(() => {
        // Autoplay blocked — not critical; user can hit play manually.
      });
      if (lightboxAudioBtn) {
        lightboxAudioBtn.textContent = lightboxMuted ? "unmute" : "mute";
      }
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
  }

  function openLightboxAt(index) {
    if (!items.length) return;
    currentIndex = ((index % items.length) + items.length) % items.length;
    showLightboxItem(items[currentIndex]);
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.src = "";
    stopLightboxVideo();
    currentIndex = -1;
    document.body.style.overflow = "";
  }

  function step(delta) {
    if (currentIndex < 0 || !items.length) return;
    currentIndex = (currentIndex + delta + items.length) % items.length;
    showLightboxItem(items[currentIndex]);
  }

  // ---------- Audio toggle ----------

  if (lightboxAudioBtn) {
    lightboxAudioBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lightboxMuted = !lightboxMuted;
      if (lightboxVideo) lightboxVideo.muted = lightboxMuted;
      lightboxAudioBtn.textContent = lightboxMuted ? "unmute" : "mute";
    });
  }

  // Click the dim overlay (but not the inner content) to close.
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  lightboxClose.addEventListener("click", closeLightbox);
  lightboxPrev.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
  lightboxNext.addEventListener("click", (e) => { e.stopPropagation(); step(1); });

  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape")          closeLightbox();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft")  step(-1);
  });

  // ---------- Video distribution ----------
  // Manifest items arrive newest-first; if all videos were added at the same
  // time they cluster at the top.  This function re-inserts them at evenly-
  // spaced positions throughout the photo list for a more natural look.
  function distributeVideos(allItems) {
    const photos = allItems.filter(it => it.type !== "video");
    const videos = allItems.filter(it => it.type === "video");
    if (!videos.length) return photos;
    if (!photos.length) return videos;

    const total   = photos.length + videos.length;
    const step    = total / (videos.length + 1); // ideal gap between insertions

    // Compute target positions, nudging forward on collision.
    const used = new Set();
    const insertAt = videos.map((_, i) => {
      let pos = Math.round(step * (i + 1));
      while (used.has(pos) || pos >= total) pos++;
      used.add(pos);
      return pos;
    });

    const result = new Array(total).fill(null);
    insertAt.forEach((pos, i) => { result[pos] = videos[i]; });

    let pi = 0;
    for (let i = 0; i < total; i++) {
      if (result[i] === null) result[i] = photos[pi++];
    }
    return result;
  }

  // ---------- Hero slideshow ----------

  const HERO_INTERVAL_MS = 5000;   // ms between auto-advances
  let heroSlides   = [];            // { item, img, dot } per hero photo
  let heroActiveIdx = 0;
  let heroTimer    = null;

  function updateHeroExif(item) {
    const exifEl = document.getElementById("hero-exif");
    if (!exifEl) return;
    // Fade out → swap text → fade in.
    exifEl.style.opacity = "0";
    setTimeout(() => {
      exifEl.textContent = captionText(item.exif || {});
      exifEl.style.opacity = "1";
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

  function startHeroTimer() {
    clearInterval(heroTimer);
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

    const dotsEl = document.createElement("div");
    dotsEl.className = "hero-dots";

    const exifEl = document.createElement("div");
    exifEl.id = "hero-exif";
    exifEl.className = "hero-exif";

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
    buildHeroSlideshow(heroList);

    items = distributeVideos(manifest.photos || []);
    lastCols = getColumnCount();

    // Defer one frame so the grid has been laid out by the browser and
    // grid.clientWidth returns an accurate value for the row-span maths.
    requestAnimationFrame(() => renderGrid(items));
  }

  // =====================================================================
  // Dev mode — drag tiles on the live site to dial in padding values,
  // then hit RECORD to copy a SEQUENCE_PADDING snippet for this file.
  // =====================================================================

  // (DEV_SNAP_PX removed — tiles snap to the 4 px grid instead of tile edges)

  // ── Inject DEV + RECORD buttons into the topbar ──────────────────────
  (function injectDevUI() {
    const nav = document.querySelector('.topbar-nav');
    if (!nav) return;

    const togBtn = document.createElement('button');
    togBtn.className = 'nav-link';
    togBtn.id = 'dev-toggle';
    togBtn.innerHTML = '<span>DEV</span>';
    nav.appendChild(togBtn);

    const recBtn = document.createElement('button');
    recBtn.className = 'nav-link';
    recBtn.id = 'dev-record';
    recBtn.innerHTML = '<span>RECORD</span>';
    recBtn.style.display = 'none';
    nav.appendChild(recBtn);

    togBtn.addEventListener('click', () => {
      devMode = !devMode;
      if (devMode) {
        // Seed live offsets from the pixel values actually rendered last time
        // (converted from TILE_PADDING fractions at the current U_rows), so
        // dragging always starts from the current visible state.
        lastRenderedPadding.forEach((v, i) => { devOffsets[i] = v; });
        // Seed the inter-group gap from the current GROUP_END_TRIM fraction.
        devGapRows = Math.round(GROUP_END_TRIM * lastRenderedU);
      }
      document.body.classList.toggle('dev-mode', devMode);
      togBtn.classList.toggle('is-active', devMode);
      recBtn.style.display = devMode ? '' : 'none';
      // Re-render: dev mode shows 1 reference group + mirror; normal shows all.
      renderGrid(items);
    });

    recBtn.addEventListener('click', recordPositions);
  })();

  // In dev mode, intercept clicks before they reach the tile's lightbox handler.
  // Capture phase (3rd arg = true) fires on the way DOWN the DOM, so we stop
  // the event before it ever reaches any .tile click listener.
  grid.addEventListener('click', e => {
    if (devMode) e.stopPropagation();
  }, true);

  // ── Called from renderGrid for each pattern tile ──────────────────────
  function setupDevTile(tileEl, groupPos) {
    devMeta.set(tileEl, { groupPos });
    tileEl.addEventListener('mousedown', onDevMouseDown, { passive: false });
  }

  // ── Gap handle drag ───────────────────────────────────────────────────
  function onGapMouseDown(e) {
    if (!devMode) return;
    e.preventDefault();
    devGapDrag = { startClientY: e.clientY, startGapRows: devGapRows };
    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  function onDevMouseDown(e) {
    if (!devMode) return;
    e.preventDefault();
    const tileEl = e.currentTarget;
    devDrag = {
      tileEl,
      startClientY: e.clientY,
      startPadding: parseFloat(tileEl.dataset.tTranslate) || 0,
    };
    tileEl.classList.add('dev-dragging');
    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  // ── Mouse move: update padding (grid-snap) + gap drag ───────────────
  document.addEventListener('mousemove', e => {
    // ── Gap drag ─────────────────────────────────────────────────────────
    if (devGapDrag) {
      const deltaRows = Math.round((e.clientY - devGapDrag.startClientY) / ROW_PX);
      devGapRows = Math.max(0, devGapDrag.startGapRows + deltaRows);
      if (devGapHandle) devGapHandle.style.gridRowEnd = `span ${Math.max(1, devGapRows)}`;
      return;
    }

    // ── Tile drag ─────────────────────────────────────────────────────────
    if (!devDrag) return;
    const { tileEl, startClientY, startPadding } = devDrag;
    let newPad = startPadding + (e.clientY - startClientY);

    // Snap to nearest 4 px grid line.
    newPad = Math.round(newPad / ROW_PX) * ROW_PX;

    tileEl.style.transform = `translateY(${newPad}px)`;
    tileEl.dataset.tTranslate = String(newPad);

    // Keep devOffsets in sync + mirror to copy tile.
    const meta = devMeta.get(tileEl);
    if (meta) {
      devOffsets[meta.groupPos] = newPad;
      const copy = devCopyTiles[meta.groupPos];
      if (copy) {
        copy.style.transform = `translateY(${newPad}px)`;
        copy.dataset.tTranslate = String(newPad);
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (devGapDrag) {
      devGapDrag = null;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      return;
    }
    if (!devDrag) return;
    devDrag.tileEl.classList.remove('dev-dragging');
    devDrag = null;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });

  // ── Record: copy TILE_PADDING + GROUP_END_TRIM snippet to clipboard ───
  // devOffsets (absolute px) → fractions via lastRenderedU (viewport-independent).
  // devGapRows → GROUP_END_TRIM fraction via lastRenderedU.
  function recordPositions() {
    const refPx        = Math.max((lastRenderedU || 1) * ROW_PX, 1);
    const toFrac       = arr => arr.map(v => (v / refPx).toFixed(3).padStart(7)).join(', ');
    const groupEndTrim = (devGapRows / Math.max(lastRenderedU, 1)).toFixed(3);
    const snippet = [
      `const TILE_PADDING    = [${toFrac(devOffsets)}];  // M0 H1 F0 F1 H4 M1 H6`,
      `const GROUP_END_TRIM  = ${groupEndTrim};`,
    ].join('\n');

    navigator.clipboard.writeText(snippet).then(() => {
      const span = document.querySelector('#dev-record span');
      if (span) {
        span.textContent = 'COPIED!';
        setTimeout(() => { span.textContent = 'RECORD'; }, 1800);
      }
    }).catch(() => {
      // Fallback: show in a prompt so the user can copy manually.
      window.prompt('Copy this snippet:', snippet);
    });
  }

})();
