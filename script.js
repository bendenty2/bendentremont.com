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
    // Videos have no EXIF specs like the R10 stills, so the grid caption is a
    // fixed format label. The real title still shows in the lightbox on click.
    tile.appendChild(buildCaption(VIDEO_SPEC_LABEL));

    tile.addEventListener("click", () => openLightboxAt(index));
    return tile;
  }

  function buildTile(item, index) {
    return item.type === "video"
      ? buildVideoTile(item, index)
      : buildPhotoTile(item, index);
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

  // Vertical space reserved below each image for its caption + the gap to the
  // next tile, in px (grid-auto-rows is 1px, so a tile's row-span ≈ its pixel
  // height). The SAME reserve on every tile is what balances the two columns;
  // the two viewports differ only because their caption CSS does.
  const RESERVE_DESKTOP = 34;
  const RESERVE_MOBILE  = 21;

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
    const isNarrow = window.innerWidth <= 700;
    grid.innerHTML = "";
    grid.style.setProperty("--cols", 2);
    grid.dataset.cols = 2;

    const { colW, colGap } = getGridMetrics(2);
    const reserve = isNarrow ? RESERVE_MOBILE : RESERVE_DESKTOP;

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
    lightboxExif.textContent  = isVideo ? VIDEO_SPEC_LABEL : captionText(item.exif || {});
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

  // Touch (mobile only): swipe left = next, right = previous — same as the
  // arrows, bounded (no wrap). A swipe suppresses the tap-to-close.
  let lbTouchX = 0, lbTouchY = 0, lbSwiped = false;
  lightbox.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    lbTouchX = t.clientX; lbTouchY = t.clientY; lbSwiped = false;
  }, { passive: true });
  lightbox.addEventListener("touchend", (e) => {
    if (window.innerWidth > 700) return;                 // mobile only
    const t = e.changedTouches[0];
    const dx = t.clientX - lbTouchX, dy = t.clientY - lbTouchY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      lbSwiped = true;
      step(dx < 0 ? 1 : -1);                             // left=next, right=prev
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

    // Tap the hero to open it in the lightbox (then arrow on into the rest of the
    // catalogue). On touch (mobile only), a horizontal swipe cycles slides
    // instead — left = next, right = previous (both wrap). Desktop keeps the
    // auto-advance + clickable dots; no swipe there.
    let swipeStartX = 0, swipeStartY = 0, didSwipe = false;
    slideshow.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      swipeStartX = t.clientX; swipeStartY = t.clientY; didSwipe = false;
    }, { passive: true });
    slideshow.addEventListener("touchend", (e) => {
      if (window.innerWidth > 700) return;                 // mobile only
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX, dy = t.clientY - swipeStartY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        didSwipe = true;                                   // suppress tap-to-open
        showHeroSlide(heroActiveIdx + (dx < 0 ? 1 : -1));  // left=next, right=prev
        startHeroTimer();                                  // reset auto-advance
      }
    }, { passive: true });
    slideshow.addEventListener("click", () => {
      if (!didSwipe) openLightboxAt(heroActiveIdx);
    });

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
