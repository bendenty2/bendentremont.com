/* ------------------------------------------------------------
   PhotoSite — main script.
   Loads window.PHOTOSITE_MANIFEST (from manifest.js), paints the
   masonry grid with EXIF captions, and wires up the lightbox
   (open, prev/next, keyboard nav, hover-preload).

   Supports both photo items (type: "photo" or no type field) and
   video items (type: "video").  Videos play muted everywhere — no audio.
   ------------------------------------------------------------ */

(() => {
  // Always open at the top on refresh — by default browsers restore the previous
  // scroll position on reload, which lands you mid-grid. Opt out and snap to top.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("load", () => window.scrollTo(0, 0));

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
    b.addEventListener("click", () => {
      const target = b.dataset.view;
      const view   = document.getElementById("view-" + target);
      const switching = !view || !view.classList.contains("is-active");
      setActiveView(target);
      // Always land at the top of the tab you clicked. Switching views jumps
      // instantly (the new view should just appear at the top); clicking the tab
      // you're already on scrolls up smoothly, like the brand button.
      window.scrollTo({ top: 0, behavior: (switching || prefersReducedMotion()) ? "auto" : "smooth" });
    });
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
  // setInterval id when a loop item is cycling in the lightbox; null otherwise.
  let lightboxLoopTimer = null;
  // Element that had focus before the lightbox opened, so we can restore it on close.
  let lastFocusedEl = null;
  // Spec caption for videos (they have no EXIF) — shown in the grid tile and,
  // below the title, in the lightbox. Mirrors how photos show their EXIF specs.
  const VIDEO_SPEC_LABEL = "Hi-8";

  // ---------- Caption ----------

  // Caption format: aperture | ISO | shutter | focal length, missing parts
  // skipped, joined with a pipe so it reads "f/8 | ISO 640 | 1/640s | 400mm".
  const CAPTION_SEP = " | ";

  function captionText(exif) {
    return [exif.aperture, exif.iso, exif.shutter, exif.focal]
      .filter(Boolean)
      .join(CAPTION_SEP);
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

    tile.addEventListener("click", () => openLightboxAt(index));
    return tile;
  }

  // A "loop" tile: the media/loop/ frames share one slot and switch instantly
  // (no fade) every item.intervalMs, ascending and wrapping. Timers are tracked
  // in loopTimers so renderGrid can clear them before rebuilding the grid.
  const loopTimers = [];
  function buildLoopTile(item, index) {
    const tile = document.createElement("figure");
    tile.className = "tile tile--loop";
    tile.dataset.id = item.id;

    const frames = item.frames || [];
    const fadeMs = item.fadeMs || 0;

    // Two stacked layers so consecutive frames cross-fade instead of popping:
    // the incoming frame fades in on top, and the outgoing one is hidden once
    // it's fully covered — ready to become the next incoming layer.
    const wrap = document.createElement("div");
    wrap.className = "loop-frames";
    if (item.width && item.height) wrap.style.aspectRatio = `${item.width} / ${item.height}`;

    const layers = [document.createElement("img"), document.createElement("img")];
    layers.forEach(im => {
      im.className = "loop-frame";
      im.alt = item.title || item.id;
      im.style.transition = `opacity ${fadeMs}ms linear, transform 220ms ease`;
      wrap.appendChild(im);
    });

    // Preload every frame so each cross-fade starts instantly (no flash).
    frames.forEach(f => { const pre = new Image(); pre.src = f.thumbnail; });

    if (frames[0]) {
      layers[0].src = frames[0].thumbnail; layers[0].style.opacity = "1";
      layers[1].style.opacity = "0";
    }

    let front = 0, k = 0;
    if (frames.length > 1) {
      loopTimers.push(setInterval(() => {
        k = (k + 1) % frames.length;
        const f = frames[k], back = 1 - front;
        layers[back].src = f.thumbnail;
        layers[back].style.zIndex = "1";
        layers[front].style.zIndex = "0";
        layers[back].style.opacity = "1";                        // fade new frame in on top
        const outgoing = layers[front];
        setTimeout(() => { outgoing.style.opacity = "0"; }, fadeMs);  // hide once covered
        front = back;
      }, item.intervalMs || 1000));
    }

    tile.appendChild(wrap);
    tile.addEventListener("click", () => openLightboxAt(index));
    return tile;
  }

  function buildTile(item, index) {
    if (item.type === "video") return buildVideoTile(item, index);
    if (item.type === "loop")  return buildLoopTile(item, index);
    return buildPhotoTile(item, index);
  }

  // ---------- Grid layout ----------
  // Two-column masonry on every screen. Tiles are emitted in layout.txt order
  // (no re-bucketing), so layout.txt is WYSIWYG — move a line, move a photo.
  // Packing is done by `grid-auto-flow: row dense` (see CSS):
  //   • medium (span 2) → full-width band
  //   • portrait        → tall single-column tile (native 2:3)
  //   • landscape/video → short single-column tile (3:2)
  // A landscape + a portrait stacked in one column balance against a portrait +
  // a landscape in the other, so [L,P,P,L] blocks interlock to equal height and
  // the following medium drops in as a full-width band beneath them.
  // Desktop and mobile run this identical routine; only the column width
  // (viewport) and the caption reserve differ, so the two views stay in sync.

  const VIDEO_CROP_RATIO = 1.5;  // 3:2 — matches .video-crop-wrapper's aspect-ratio

  function getGridMetrics(cols) {
    const style  = getComputedStyle(grid);
    const padL   = parseFloat(style.paddingLeft)  || 0;
    const padR   = parseFloat(style.paddingRight) || 0;
    const colGap = parseFloat(style.columnGap)    || 16;
    const inner  = (grid.clientWidth || window.innerWidth) - padL - padR;
    const colW   = (inner - colGap * (cols - 1)) / cols;
    return { colW, colGap };
  }

  function renderGrid(list) {
    // Stop loop timers from the previous render before dropping their tiles.
    loopTimers.forEach(clearInterval);
    loopTimers.length = 0;
    grid.innerHTML = "";
    grid.style.setProperty("--cols", 2);
    grid.dataset.cols = 2;

    const { colW, colGap } = getGridMetrics(2);
    // Vertical gap below each image = the column gap, so the grid gutters are
    // equal horizontally and vertically. (grid-auto-rows is 1px, so a row-span ≈
    // a pixel height; the same reserve on every tile balances the two columns.)
    const reserve = colGap;

    // Heroes are lightbox items 0..N-1; the grid follows in this exact order.
    items = heroItems.concat(list);

    list.forEach((item, i) => {
      const tile  = buildTile(item, heroItems.length + i);
      const span2 = item.span === 2;                 // medium → full-width band
      tile.style.gridColumn = span2 ? "span 2" : "span 1";

      const dispW = span2 ? (colW * 2 + colGap) : colW;
      let imgH;
      if (item.type === "video")          imgH = dispW / VIDEO_CROP_RATIO;   // 3:2
      else if (item.width && item.height) imgH = dispW * item.height / item.width;
      else                                imgH = dispW;                      // unknown aspect
      tile.style.gridRowEnd = `span ${Math.max(1, Math.ceil(imgH + reserve))}`;

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

  function stopLightboxLoop() {
    if (lightboxLoopTimer) {
      clearInterval(lightboxLoopTimer);
      lightboxLoopTimer = null;
    }
  }

  function showLightboxItem(item) {
    stopLightboxLoop();
    resetZoom(false);                 // every photo opens at 100%

    const isVideo = item.type === "video";
    const isLoop  = item.type === "loop";

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
      lightboxTitle.textContent = item.title || "";
      lightboxExif.textContent  = VIDEO_SPEC_LABEL;
    } else if (isLoop) {
      // Loop: cycle the full-res frames in the lightbox at the same cadence,
      // updating the title + specs to match whichever frame is showing.
      stopLightboxVideo();
      const frames = item.frames || [];
      const show = (k) => {
        const f = frames[k];
        if (!f) return;
        lightboxImg.src = f.full;
        lightboxImg.alt = f.title || item.id;
        lightboxTitle.textContent = f.title || "";
        lightboxExif.textContent  = captionText(f.exif || {});
      };
      let k = 0;
      show(0);
      if (frames.length > 1) {
        lightboxLoopTimer = setInterval(() => {
          k = (k + 1) % frames.length;
          show(k);
        }, item.intervalMs || 1000);
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
      lightboxTitle.textContent = item.title || "";
      lightboxExif.textContent  = captionText(item.exif || {});
    }

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
    stopLightboxLoop();
    resetZoom(false);
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

  // ── Touch: custom pinch-zoom + pan for the lightbox photo (mobile only) ─────
  // The viewer owns its zoom via a CSS transform on the image (not the browser's
  // page zoom), so we can reliably pinch to zoom the photo, drag to pan it on a
  // static backdrop, TAP to snap back to 100%, and swipe to change photos only
  // at 100%. touch-action:none (CSS) keeps native pinch/pan from interfering.
  // Desktop (mouse) is untouched — every handler bails above 700px.
  let lbSwiped = false;
  let zScale = 1, zTx = 0, zTy = 0;             // current photo transform
  let gMode = null;                             // 'pinch' | 'pan' | 'swipe' | null
  let gMoved = false;
  let gStartDist = 1, gStartScale = 1, gStartTx = 0, gStartTy = 0;
  let gFocal0 = { x: 0, y: 0 }, gCenter = { x: 0, y: 0 }, gStart = { x: 0, y: 0 };
  let gNatW = 0, gNatH = 0;
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;   // double-tap-to-zoom tracking
  const Z_MAX = 6, DOUBLE_TAP_MS = 300, DOUBLE_TAP_ZOOM = 2.5;

  function applyZoom(animate) {
    lightboxImg.style.transition = animate ? "transform 200ms ease" : "none";
    lightboxImg.style.transform  = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;
  }
  function resetZoom(animate) { zScale = 1; zTx = 0; zTy = 0; applyZoom(animate); }
  function clampPan() {
    // Keep the scaled image from being dragged past its own edges.
    const maxX = Math.max(0, (gNatW * zScale - window.innerWidth)  / 2);
    const maxY = Math.max(0, (gNatH * zScale - window.innerHeight) / 2);
    zTx = Math.max(-maxX, Math.min(maxX, zTx));
    zTy = Math.max(-maxY, Math.min(maxY, zTy));
  }
  const zoomable = () => lightboxImg.style.display !== "none";  // photos + loop, not video

  lightbox.addEventListener("touchstart", (e) => {
    // No width gate: touch events only fire on touch devices, and we want the
    // gestures in landscape too (an iPhone in landscape is >700px wide).
    lbSwiped = false; gMoved = false;
    gNatW = lightboxImg.offsetWidth; gNatH = lightboxImg.offsetHeight;
    if (e.touches.length === 2 && zoomable()) {
      gMode = "pinch";
      const [a, b] = e.touches;
      gStartDist  = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      gStartScale = zScale; gStartTx = zTx; gStartTy = zTy;
      gFocal0 = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const r = lightboxImg.getBoundingClientRect();
      gCenter = { x: r.left + r.width / 2 - zTx, y: r.top + r.height / 2 - zTy };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      gStart = { x: t.clientX, y: t.clientY };
      gStartTx = zTx; gStartTy = zTy;
      gMode = (zoomable() && zScale > 1) ? "pan" : "swipe";
    }
  }, { passive: true });

  lightbox.addEventListener("touchmove", (e) => {
    if (gMode === "pinch" && e.touches.length >= 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const dist  = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const focal = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const s = Math.max(1, Math.min(Z_MAX, gStartScale * (dist / gStartDist)));
      zScale = s;
      zTx = focal.x - gCenter.x - (s / gStartScale) * (gFocal0.x - gCenter.x - gStartTx);
      zTy = focal.y - gCenter.y - (s / gStartScale) * (gFocal0.y - gCenter.y - gStartTy);
      clampPan(); applyZoom(false); gMoved = true;
    } else if (gMode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      zTx = gStartTx + (t.clientX - gStart.x);
      zTy = gStartTy + (t.clientY - gStart.y);
      clampPan(); applyZoom(false); gMoved = true;
    } else if (gMode === "swipe" && e.touches.length === 1) {
      const t = e.touches[0];
      if (Math.abs(t.clientX - gStart.x) > 10 || Math.abs(t.clientY - gStart.y) > 10) gMoved = true;
    }
  }, { passive: false });

  lightbox.addEventListener("touchend", (e) => {
    if (gMode === "pinch") {
      if (zScale <= 1.02) resetZoom(true);
      lbSwiped = true; gMode = null; return;
    }
    if (gMode === "pan") {
      if (!gMoved) resetZoom(true);           // a tap while zoomed → back to 100%
      lbSwiped = true; gMode = null; return;
    }
    if (gMode === "swipe") {
      gMode = null;
      if (!gMoved) {
        // Tap at 100% (a tap while zoomed is a 'pan', handled above). A double-
        // tap on the photo zooms in toward the tapped point; a single tap does
        // nothing here (overlay taps close via the click handler).
        const now = Date.now();
        const r = lightboxImg.getBoundingClientRect();
        const onImg = zoomable() &&
          gStart.x >= r.left && gStart.x <= r.right &&
          gStart.y >= r.top  && gStart.y <= r.bottom;
        if (onImg && now - lastTapTime < DOUBLE_TAP_MS &&
            Math.abs(gStart.x - lastTapX) < 40 && Math.abs(gStart.y - lastTapY) < 40) {
          lastTapTime = 0;                    // consume the pair
          gNatW = lightboxImg.offsetWidth; gNatH = lightboxImg.offsetHeight;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          zScale = DOUBLE_TAP_ZOOM;
          zTx = (gStart.x - cx) * (1 - DOUBLE_TAP_ZOOM);   // keep the tapped point fixed
          zTy = (gStart.y - cy) * (1 - DOUBLE_TAP_ZOOM);
          clampPan(); applyZoom(true);
          lbSwiped = true;
        } else {
          lastTapTime = now; lastTapX = gStart.x; lastTapY = gStart.y;
        }
        return;
      }
      lbSwiped = true;                        // any drag suppresses the tap-to-close
      const t = (e.changedTouches && e.changedTouches[0]) || {};
      const dx = (t.clientX || 0) - gStart.x, dy = (t.clientY || 0) - gStart.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        step(dx < 0 ? 1 : -1);                // left = next, right = prev (100% only)
      }
    }
  }, { passive: true });

  // Click the dim overlay (but not the inner content) to close — unless that
  // "click" was actually a swipe.
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox && !lbSwiped) closeLightbox();
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
  function showHeroSlide(index) {
    const n = heroSlides.length;
    if (!n) return;
    heroActiveIdx = ((index % n) + n) % n;
    heroSlides.forEach((s, i) => {
      s.img.classList.toggle("is-active", i === heroActiveIdx);
      if (s.dot) s.dot.classList.toggle("is-active", i === heroActiveIdx);
    });
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

    // Tap the hero to open it in the lightbox. On touch (mobile only), drag
    // horizontally to SLIDE between photos Instagram-style — you see slivers of
    // both neighbours mid-drag — snapping to the next/prev (both wrap) on release.
    // The AUTO-advance keeps its fade (showHeroSlide); only the manual gesture
    // slides. Desktop fires no touch events, so it's untouched.
    let swipeStartX = 0, swipeStartY = 0, didSwipe = false;
    let heroDragging = false, heroNeighbor = -1;
    const heroW = () => slideshow.clientWidth || 1;

    function clearHeroImg(img) {
      img.style.transition = ""; img.style.transform = "";
      img.style.opacity = ""; img.style.zIndex = "";
    }
    function finishHeroSlide(landingIdx) {
      showHeroSlide(landingIdx);             // is-active/dots/exif for the landing slide
      heroSlides.forEach(s => {              // snap every img back to the crossfade-stack state,
        s.img.style.transition = "none";     // instantly (no fade artifact)
        s.img.style.transform = ""; s.img.style.opacity = ""; s.img.style.zIndex = "";
      });
      void slideshow.offsetWidth;            // flush, then restore CSS transitions for the next fade
      heroSlides.forEach(s => { s.img.style.transition = ""; });
      startHeroTimer();                      // resume auto-advance
    }

    slideshow.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      swipeStartX = t.clientX; swipeStartY = t.clientY;
      didSwipe = false; heroDragging = false; heroNeighbor = -1;
    }, { passive: true });

    slideshow.addEventListener("touchmove", (e) => {
      if (window.innerWidth > 700 || heroSlides.length < 2) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX, dy = t.clientY - swipeStartY;
      if (!heroDragging) {
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;  // wait for a clear horizontal drag
        heroDragging = true; didSwipe = true;
        clearInterval(heroTimer);            // pause auto-advance while dragging
      }
      e.preventDefault();                    // lock to horizontal (passive:false below)
      const w = heroW(), n = heroSlides.length;
      const nIdx = dx < 0 ? (heroActiveIdx + 1) % n : (heroActiveIdx - 1 + n) % n;
      if (heroNeighbor !== -1 && heroNeighbor !== nIdx) clearHeroImg(heroSlides[heroNeighbor].img);
      heroNeighbor = nIdx;
      const active = heroSlides[heroActiveIdx].img, neighbor = heroSlides[nIdx].img;
      const off = dx < 0 ? w : -w;           // neighbour's off-screen home (from the right for next)
      active.style.transition = "none";
      active.style.transform = `translateX(${dx}px)`;
      active.style.opacity = "1"; active.style.zIndex = "2";
      neighbor.style.transition = "none";
      neighbor.style.transform = `translateX(${dx + off}px)`;
      neighbor.style.opacity = "1"; neighbor.style.zIndex = "1";
    }, { passive: false });

    slideshow.addEventListener("touchend", (e) => {
      if (!heroDragging) return;             // a tap (or vertical scroll) — click opens the lightbox
      heroDragging = false;
      const active = heroSlides[heroActiveIdx].img;
      const neighbor = heroNeighbor !== -1 ? heroSlides[heroNeighbor].img : null;
      const dx = e.changedTouches[0].clientX - swipeStartX;
      const w = heroW();
      const commit = neighbor && Math.abs(dx) > Math.min(60, w * 0.18);
      const off = dx < 0 ? w : -w, DUR = 260;
      active.style.transition = `transform ${DUR}ms ease`;
      if (neighbor) neighbor.style.transition = `transform ${DUR}ms ease`;
      if (commit) {
        active.style.transform = `translateX(${-off}px)`;   // active slides fully out
        neighbor.style.transform = "translateX(0px)";       // neighbour to centre
        const landing = heroNeighbor;
        setTimeout(() => finishHeroSlide(landing), DUR);
      } else {
        active.style.transform = "translateX(0px)";         // snap back
        if (neighbor) neighbor.style.transform = `translateX(${off}px)`;
        setTimeout(() => finishHeroSlide(heroActiveIdx), DUR);
      }
    }, { passive: true });

    slideshow.addEventListener("click", () => {
      if (!didSwipe) openLightboxAt(heroActiveIdx);
    });

    const dotsEl = document.createElement("div");
    dotsEl.className = "hero-dots";

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
    if (heroes.length > 1) heroSection.appendChild(dotsEl);       // dots below the photo
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
