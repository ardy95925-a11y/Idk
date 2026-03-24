/**
 * LUMIÈRE — Pro Camera Engine
 * Custom rendering pipeline with real-time filter processing
 * on an HTML5 Canvas with WebGL-inspired pixel manipulation.
 */

(() => {
  'use strict';

  /* ─── DOM REFS ─────────────────────────────────────── */
  const video         = document.getElementById('videoSource');
  const liveCanvas    = document.getElementById('liveCanvas');
  const ctx           = liveCanvas.getContext('2d', { willReadFrequently: true });
  const noCameraMsg   = document.getElementById('noCameraMsg');
  const startCamBtn   = document.getElementById('startCamBtn');
  const shutter       = document.getElementById('shutter');
  const flipBtn       = document.getElementById('flipBtn');
  const flashOverlay  = document.getElementById('flashOverlay');
  const filterStrip   = document.getElementById('filterStrip');
  const filterLabel   = document.getElementById('filterLabel');
  const recDot        = document.getElementById('recDot');
  const modeLabel     = document.getElementById('modeLabel');
  const isoVal        = document.getElementById('isoVal');
  const apertureVal   = document.getElementById('apertureVal');
  const ssVal         = document.getElementById('ssVal');
  const zoomBar       = document.getElementById('zoomBar');
  const zoomValEl     = document.getElementById('zoomVal');
  const exposureSlider= document.getElementById('exposureSlider');
  const exposureVal   = document.getElementById('exposureVal');
  const histCanvas    = document.getElementById('histogram');
  const histCtx       = histCanvas.getContext('2d');
  const modeTabs      = document.querySelectorAll('.mode-tab');
  const toastEl       = document.getElementById('toast');
  const timeDisplay   = document.getElementById('timeDisplay');

  const galleryModal  = document.getElementById('gallery');
  const galleryGrid   = document.getElementById('galleryGrid');
  const galleryThumb  = document.getElementById('galleryThumb');
  const closeGallery  = document.getElementById('closeGallery');
  const emptyGallery  = document.getElementById('emptyGallery');

  const lightbox      = document.getElementById('lightbox');
  const lightboxImg   = document.getElementById('lightboxImg');
  const closeLightbox = document.getElementById('closeLightbox');
  const downloadBtn   = document.getElementById('downloadBtn');
  const deleteLbBtn   = document.getElementById('deleteLbBtn');
  const focusRing     = document.getElementById('focusRing');
  const shutterRipple = document.getElementById('shutterRipple');
  const resLabel      = document.getElementById('resLabel');

  /* ─── STATE ─────────────────────────────────────────── */
  let stream          = null;
  let facingMode      = 'environment';  // back camera first
  let activeFilter    = 'natural';
  let shootMode       = 'photo';
  let exposure        = 0;            // -2 to +2 EV
  let zoom            = 1.0;
  let cameraReady     = false;
  let animFrameId     = null;
  let gallery         = [];           // array of dataURLs
  let lightboxIndex   = -1;
  let burstActive     = false;
  let burstTimer      = null;
  let zoomHideTimer   = null;

  /* Temp off-screen canvas for pixel processing */
  const offCanvas     = document.createElement('canvas');
  const offCtx        = offCanvas.getContext('2d', { willReadFrequently: true });

  /* ─── FILTERS DEFINITION ────────────────────────────── */
  /**
   * Each filter has:
   *   name         — display name
   *   id           — unique key
   *   css          — CSS filter string for quick thumbnail preview
   *   process(img) — pixel-level processing function  (ImageData → void)
   *   vignette     — vignette intensity  0-1
   *   grain        — grain intensity    0-1
   *   haze         — colour haze overlay {r,g,b,a}|null
   */
  const FILTERS = [
    {
      id: 'natural', name: 'Natural',
      css: 'none',
      process: (d) => expose(d, exposure),
      vignette: 0.0, grain: 0.0, haze: null
    },
    {
      id: 'vivid', name: 'Vivid',
      css: 'saturate(1.8) contrast(1.1)',
      process: (d) => { expose(d, exposure); saturate(d, 1.7); contrast(d, 1.12); },
      vignette: 0.15, grain: 0.0, haze: null
    },
    {
      id: 'matte', name: 'Matte',
      css: 'contrast(0.88) brightness(1.06) saturate(0.9)',
      process: (d) => { expose(d, exposure); matte(d); },
      vignette: 0.2, grain: 0.04, haze: { r:255, g:240, b:220, a:18 }
    },
    {
      id: 'noir', name: 'Noir',
      css: 'grayscale(1) contrast(1.2)',
      process: (d) => { expose(d, exposure); toGrayscale(d, 'luminance'); contrast(d, 1.25); },
      vignette: 0.45, grain: 0.09, haze: null
    },
    {
      id: 'cine', name: 'Cinéma',
      css: 'sepia(0.3) contrast(1.1) brightness(0.95)',
      process: (d) => { expose(d, exposure); cinemaLUT(d); },
      vignette: 0.35, grain: 0.07, haze: { r:255, g:220, b:160, a:14 }
    },
    {
      id: 'arctic', name: 'Arctic',
      css: 'saturate(0.6) brightness(1.1) hue-rotate(195deg)',
      process: (d) => { expose(d, exposure); colorBalance(d, -10, 0, 30); saturate(d, 0.55); },
      vignette: 0.1, grain: 0.02, haze: { r:180, g:220, b:255, a:16 }
    },
    {
      id: 'golden', name: 'Golden Hour',
      css: 'sepia(0.5) saturate(1.4) brightness(1.05)',
      process: (d) => { expose(d, exposure); goldenHour(d); },
      vignette: 0.3, grain: 0.05, haze: { r:255, g:180, b:80, a:20 }
    },
    {
      id: 'fade', name: 'Fade',
      css: 'brightness(1.15) contrast(0.85) saturate(0.75)',
      process: (d) => { expose(d, exposure); fade(d); },
      vignette: 0.0, grain: 0.03, haze: { r:220, g:210, b:200, a:25 }
    },
    {
      id: 'velvet', name: 'Velvet',
      css: 'contrast(1.05) saturate(1.2) hue-rotate(330deg)',
      process: (d) => { expose(d, exposure); velvet(d); },
      vignette: 0.5, grain: 0.06, haze: { r:180, g:120, b:200, a:12 }
    },
    {
      id: 'retro', name: 'Retro',
      css: 'sepia(0.7) contrast(1.15) saturate(1.1)',
      process: (d) => { expose(d, exposure); retro(d); },
      vignette: 0.4, grain: 0.12, haze: { r:200, g:160, b:100, a:22 }
    },
    {
      id: 'chrome', name: 'Chrome',
      css: 'contrast(1.25) saturate(1.35) brightness(1.05)',
      process: (d) => { expose(d, exposure); chrome(d); },
      vignette: 0.2, grain: 0.0, haze: null
    },
    {
      id: 'drama', name: 'Drama',
      css: 'contrast(1.4) saturate(0.8) brightness(0.9)',
      process: (d) => { expose(d, exposure); drama(d); },
      vignette: 0.55, grain: 0.08, haze: null
    }
  ];

  /* ─── PIXEL PROCESSING FUNCTIONS ───────────────────── */
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // Exposure adjustment (EV stops)
  function expose(d, ev) {
    if (ev === 0) return;
    const mul = Math.pow(2, ev);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp(px[i]   * mul);
      px[i+1] = clamp(px[i+1] * mul);
      px[i+2] = clamp(px[i+2] * mul);
    }
  }

  function saturate(d, s) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      const grey = 0.2126*r + 0.7152*g + 0.0722*b;
      px[i]   = clamp(grey + (r - grey) * s);
      px[i+1] = clamp(grey + (g - grey) * s);
      px[i+2] = clamp(grey + (b - grey) * s);
    }
  }

  function contrast(d, c) {
    const px = d.data, f = c;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp((px[i]   - 128) * f + 128);
      px[i+1] = clamp((px[i+1] - 128) * f + 128);
      px[i+2] = clamp((px[i+2] - 128) * f + 128);
    }
  }

  function toGrayscale(d, method) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      const grey = method === 'luminance'
        ? 0.2126*r + 0.7152*g + 0.0722*b
        : (r+g+b)/3;
      px[i] = px[i+1] = px[i+2] = clamp(grey);
    }
  }

  function colorBalance(d, dr, dg, db) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp(px[i]   + dr);
      px[i+1] = clamp(px[i+1] + dg);
      px[i+2] = clamp(px[i+2] + db);
    }
  }

  function matte(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp(px[i]   * 0.92 + 15);
      px[i+1] = clamp(px[i+1] * 0.93 + 10);
      px[i+2] = clamp(px[i+2] * 0.94 + 8);
    }
    contrast(d, 0.9);
    saturate(d, 0.85);
  }

  function cinemaLUT(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      let r = px[i] / 255, g = px[i+1] / 255, b = px[i+2] / 255;
      // Slight orange-teal split: lift shadows to teal, push highlights to amber
      r = r * 0.88 + g * 0.07 + b * 0.02 + 0.04;
      g = g * 0.92 + r * 0.05 + 0.02;
      b = b * 0.78 + 0.05;
      px[i]   = clamp(r * 255);
      px[i+1] = clamp(g * 255);
      px[i+2] = clamp(b * 255);
    }
    contrast(d, 1.12);
  }

  function goldenHour(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114) / 255;
      const warm = lum * 40;
      px[i]   = clamp(px[i]   + warm + 12);
      px[i+1] = clamp(px[i+1] + warm * 0.5 + 4);
      px[i+2] = clamp(px[i+2] - warm * 0.3);
    }
    saturate(d, 1.35);
  }

  function fade(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp(px[i]   * 0.85 + 20);
      px[i+1] = clamp(px[i+1] * 0.85 + 18);
      px[i+2] = clamp(px[i+2] * 0.88 + 15);
    }
    saturate(d, 0.75);
  }

  function velvet(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp(px[i]   * 0.92 + px[i+2] * 0.12);
      px[i+2] = clamp(px[i+2] * 1.15 + 10);
    }
    saturate(d, 1.25);
    contrast(d, 1.08);
  }

  function retro(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      px[i]   = clamp(r * 0.82 + g * 0.1  + b * 0.02 + 25);
      px[i+1] = clamp(r * 0.04 + g * 0.78 + b * 0.05 + 15);
      px[i+2] = clamp(r * 0.02 + g * 0.04 + b * 0.68 + 8);
    }
    contrast(d, 1.1);
  }

  function chrome(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i]   = clamp(px[i]   * 1.05 + 8);
      px[i+1] = clamp(px[i+1] * 1.02 + 2);
      px[i+2] = clamp(px[i+2] * 0.98);
    }
    contrast(d, 1.2);
    saturate(d, 1.4);
  }

  function drama(d) {
    toGrayscale(d, 'luminance');
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i];
      // S-curve: crush shadows, blow highlights
      const curved = v < 128
        ? (v / 128) ** 1.4 * 128
        : 255 - ((255 - v) / 127) ** 1.3 * 127;
      px[i] = px[i+1] = px[i+2] = clamp(curved);
    }
  }

  /* ─── VIGNETTE ──────────────────────────────────────── */
  function applyVignette(intensity) {
    if (intensity <= 0) return;
    const w = liveCanvas.width, h = liveCanvas.height;
    const cx = w / 2, cy = h / 2;
    const r = Math.sqrt(cx*cx + cy*cy) * 1.05;
    const grad = ctx.createRadialGradient(cx, cy, r * (1 - intensity * 0.9), cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(intensity * 0.85, 0.82)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  /* ─── GRAIN ─────────────────────────────────────────── */
  function applyGrain(intensity) {
    if (intensity <= 0) return;
    const w = liveCanvas.width, h = liveCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;
    const mag = intensity * 60;
    for (let i = 0; i < px.length; i += 4) {
      const g = (Math.random() - 0.5) * mag;
      px[i]   = clamp(px[i]   + g);
      px[i+1] = clamp(px[i+1] + g);
      px[i+2] = clamp(px[i+2] + g);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /* ─── HAZE / COLOUR OVERLAY ─────────────────────────── */
  function applyHaze(haze) {
    if (!haze) return;
    ctx.fillStyle = `rgba(${haze.r},${haze.g},${haze.b},${haze.a/255})`;
    ctx.fillRect(0, 0, liveCanvas.width, liveCanvas.height);
  }

  /* ─── PORTRAIT / BLUR SIMULATION ───────────────────── */
  function applyPortraitBlur() {
    // Simulate shallow DOF: blur edges via multiple semi-transparent passes
    const w = liveCanvas.width, h = liveCanvas.height;
    ctx.save();
    const cx = w / 2, cy = h / 2;
    const rx = w * 0.32, ry = h * 0.44;
    // Create an elliptical clip mask that's *outside* focus area → blur ring
    const snap = ctx.getImageData(0, 0, w, h);
    // Blur by downscaling + upscaling
    offCanvas.width = Math.round(w / 4);
    offCanvas.height = Math.round(h / 4);
    offCtx.drawImage(liveCanvas, 0, 0, offCanvas.width, offCanvas.height);
    ctx.restore();

    // Draw blurred version outside ellipse
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip('evenodd');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offCanvas, 0, 0, w, h);
    ctx.restore();

    // Subtle focus ring indicator
    ctx.save();
    ctx.strokeStyle = 'rgba(201,169,110,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ─── RENDER LOOP ───────────────────────────────────── */
  function renderFrame() {
    if (!cameraReady || video.readyState < 2) {
      animFrameId = requestAnimationFrame(renderFrame);
      return;
    }

    const w = liveCanvas.width, h = liveCanvas.height;

    // Draw video with zoom
    const scale = zoom;
    const sw = w / scale, sh = h / scale;
    const sx = (w - sw) / 2, sy = (h - sh) / 2;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

    // Pixel processing via offscreen canvas
    const filter = FILTERS.find(f => f.id === activeFilter) || FILTERS[0];

    // Get pixel data and process
    const imgData = ctx.getImageData(0, 0, w, h);
    filter.process(imgData);
    ctx.putImageData(imgData, 0, 0);

    // Portrait mode: apply blur outside focus area
    if (shootMode === 'portrait') applyPortraitBlur();

    // Post-process compositing (order matters)
    applyHaze(filter.haze);
    applyGrain(filter.grain + (shootMode === 'noir' ? 0.06 : 0));
    applyVignette(filter.vignette + (shootMode === 'portrait' ? 0.3 : 0));

    // Histogram
    drawHistogram(ctx.getImageData(0, 0, w, h));

    animFrameId = requestAnimationFrame(renderFrame);
  }

  /* ─── HISTOGRAM ─────────────────────────────────────── */
  function drawHistogram(imgData) {
    const bins = new Float32Array(64);
    const px = imgData.data;
    const step = 16; // sample every N-th pixel for speed
    let max = 0;
    for (let i = 0; i < px.length; i += 4 * step) {
      const lum = Math.round((0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]) / 255 * 63);
      bins[lum]++;
      if (bins[lum] > max) max = bins[lum];
    }
    const W = histCanvas.width, H = histCanvas.height;
    histCtx.clearRect(0, 0, W, H);
    histCtx.fillStyle = 'rgba(201,169,110,0.55)';
    const bw = W / 64;
    for (let i = 0; i < 64; i++) {
      const bh = (bins[i] / max) * H;
      histCtx.fillRect(i * bw, H - bh, bw - 0.5, bh);
    }
  }

  /* ─── CAMERA INIT ───────────────────────────────────── */
  async function startCamera() {
    try {
      if (stream) { stream.getTracks().forEach(t => t.stop()); }

      const constraints = {
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1440 },
          frameRate: { ideal: 30 }
        },
        audio: false
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        resizeCanvas();
        cameraReady = true;
        noCameraMsg.style.display = 'none';
        recDot.classList.remove('idle');
        showToast('Camera ready');
        if (animFrameId) cancelAnimationFrame(animFrameId);
        renderFrame();
      };
    } catch (err) {
      console.error('Camera error:', err);
      showToast('Camera access denied');
    }
  }

  function resizeCanvas() {
    const wrap = document.getElementById('viewfinder-wrap');
    liveCanvas.width  = wrap.offsetWidth;
    liveCanvas.height = wrap.offsetHeight;
    updateResLabel();
  }

  function updateResLabel() {
    const w = liveCanvas.width, h = liveCanvas.height;
    const mp = Math.round((w * h) / 1_000_000 * 10) / 10;
    resLabel.textContent = `${mp}MP`;
  }

  /* ─── CAPTURE ───────────────────────────────────────── */
  function capturePhoto() {
    if (!cameraReady) { showToast('No camera active'); return; }

    // Flash effect
    flashOverlay.classList.add('flash');
    setTimeout(() => flashOverlay.classList.remove('flash'), 120);

    // Shutter ripple
    createRipple();

    // Grab current frame + full processing on capture canvas
    const capCanvas = document.createElement('canvas');
    const capCtx    = capCanvas.getContext('2d');
    capCanvas.width  = liveCanvas.width;
    capCanvas.height = liveCanvas.height;

    // Copy rendered live frame (already processed)
    capCtx.drawImage(liveCanvas, 0, 0);

    // Add LUMIÈRE watermark
    const cw = capCanvas.width, ch = capCanvas.height;
    capCtx.save();
    capCtx.globalAlpha = 0.35;
    capCtx.fillStyle = '#c9a96e';
    capCtx.font = `${Math.round(cw * 0.022)}px 'Bebas Neue', sans-serif`;
    capCtx.textAlign = 'right';
    capCtx.letterSpacing = '0.15em';
    capCtx.fillText('LUMIÈRE', cw - 16, ch - 16);
    capCtx.restore();

    const dataURL = capCanvas.toDataURL('image/jpeg', 0.96);
    gallery.push(dataURL);
    updateGalleryThumb(dataURL);
    showToast(`Captured · ${gallery.length} shot${gallery.length > 1 ? 's' : ''}`);
    updateHUDRandomise();
  }

  function createRipple() {
    const wrap = document.getElementById('viewfinder-wrap');
    const cx = wrap.offsetWidth / 2, cy = wrap.offsetHeight / 2;
    const el = document.createElement('div');
    el.className = 'ripple-ring';
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    el.style.width = el.style.height = '40px';
    shutterRipple.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  /* ─── BURST MODE ─────────────────────────────────────── */
  function startBurst() {
    if (!cameraReady) return;
    burstActive = true;
    let count = 0;
    shutter.querySelector('.inner').style.background = '#e05252';
    burstTimer = setInterval(() => {
      capturePhoto();
      count++;
      if (count >= 6) stopBurst();
    }, 220);
  }

  function stopBurst() {
    clearInterval(burstTimer);
    burstActive = false;
    shutter.querySelector('.inner').style.background = '';
    showToast('Burst complete · 6 shots');
  }

  /* ─── FOCUS-ON-TAP ───────────────────────────────────── */
  liveCanvas.addEventListener('click', (e) => {
    const rect = liveCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    focusRing.style.left = x + 'px';
    focusRing.style.top  = y + 'px';
    focusRing.style.width  = '80px';
    focusRing.style.height = '80px';
    focusRing.classList.add('active');

    // Animate focus snap
    setTimeout(() => {
      focusRing.style.width  = '58px';
      focusRing.style.height = '58px';
    }, 150);
    setTimeout(() => focusRing.classList.remove('active'), 1800);
  });

  /* ─── PINCH-TO-ZOOM ──────────────────────────────────── */
  let pinchStart = null;
  liveCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStart = getPinchDist(e);
    }
  }, { passive: true });

  liveCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart !== null) {
      const dist = getPinchDist(e);
      const ratio = dist / pinchStart;
      zoom = Math.min(Math.max(zoom * ratio, 1.0), 5.0);
      zoom = Math.round(zoom * 10) / 10;
      pinchStart = dist;
      zoomValEl.textContent = zoom.toFixed(1);
      zoomBar.classList.add('show');
      clearTimeout(zoomHideTimer);
      zoomHideTimer = setTimeout(() => zoomBar.classList.remove('show'), 1500);
    }
  }, { passive: true });

  liveCanvas.addEventListener('touchend', () => { pinchStart = null; }, { passive: true });

  function getPinchDist(e) {
    const t = e.touches;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  /* ─── EXPOSURE SLIDER ────────────────────────────────── */
  exposureSlider.addEventListener('input', () => {
    exposure = parseFloat(exposureSlider.value);
    exposureVal.textContent = exposure > 0 ? `+${exposure}` : exposure;
    updateHUDExposure();
  });

  function updateHUDExposure() {
    const baseISO = 100;
    const iso = Math.round(baseISO * Math.pow(2, 2 - exposure));
    isoVal.textContent = iso;
    ssVal.textContent = `1/${Math.round(60 / Math.pow(2, exposure))}`;
  }

  function updateHUDRandomise() {
    const isos = [100, 200, 400, 800, 1600, 3200];
    const aps  = [1.2, 1.4, 1.8, 2.0, 2.8, 4.0];
    isoVal.textContent      = isos[Math.floor(Math.random() * isos.length)];
    apertureVal.textContent = aps[Math.floor(Math.random() * aps.length)];
  }

  /* ─── MODE TABS ──────────────────────────────────────── */
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      shootMode = tab.dataset.mode;
      modeLabel.textContent = shootMode.toUpperCase();

      // Noir mode forces noir filter
      if (shootMode === 'noir') setFilter('noir');
      if (shootMode === 'portrait') setFilter('velvet');
      showToast(`Mode: ${shootMode.charAt(0).toUpperCase() + shootMode.slice(1)}`);
    });
  });

  /* ─── FILTER STRIP BUILD ─────────────────────────────── */
  function buildFilterStrip() {
    filterStrip.innerHTML = '';
    FILTERS.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (f.id === activeFilter ? ' active' : '');
      btn.dataset.id = f.id;

      const thumb = document.createElement('div');
      thumb.className = 'filter-thumb';
      const tc = document.createElement('canvas');
      tc.width = 38; tc.height = 38;
      thumb.appendChild(tc);
      drawFilterThumb(tc, f);

      const label = document.createElement('div');
      label.className = 'filter-name';
      label.textContent = f.name;

      btn.appendChild(thumb);
      btn.appendChild(label);
      btn.addEventListener('click', () => setFilter(f.id));
      filterStrip.appendChild(btn);
    });
  }

  function drawFilterThumb(canvas, filter) {
    const tCtx = canvas.getContext('2d');
    // Draw a simple gradient swatch
    const g = tCtx.createLinearGradient(0, 0, 38, 38);
    g.addColorStop(0, '#2a1a0a');
    g.addColorStop(0.4, '#5a3c28');
    g.addColorStop(0.7, '#8a6a40');
    g.addColorStop(1, '#c8a060');
    tCtx.fillStyle = g;
    tCtx.fillRect(0, 0, 38, 38);

    // Apply CSS filter for quick preview
    if (filter.css !== 'none') {
      canvas.style.filter = filter.css;
    }

    // Draw a tiny simulated scene
    tCtx.fillStyle = 'rgba(0,0,0,0.25)';
    tCtx.fillRect(0, 22, 38, 16);
    tCtx.fillStyle = 'rgba(255,255,255,0.08)';
    tCtx.beginPath();
    tCtx.arc(19, 14, 8, 0, Math.PI * 2);
    tCtx.fill();
  }

  function setFilter(id) {
    activeFilter = id;
    const f = FILTERS.find(x => x.id === id);
    if (f) filterLabel.textContent = f.name;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.id === id);
    });
  }

  /* ─── GALLERY ────────────────────────────────────────── */
  function updateGalleryThumb(dataURL) {
    galleryThumb.innerHTML = `<img src="${dataURL}" alt="last photo" />`;
  }

  galleryThumb.addEventListener('click', openGallery);
  closeGallery.addEventListener('click', () => galleryModal.classList.remove('open'));

  function openGallery() {
    galleryGrid.innerHTML = '';
    if (gallery.length === 0) {
      emptyGallery.classList.add('show');
    } else {
      emptyGallery.classList.remove('show');
      gallery.forEach((url, i) => {
        const img = document.createElement('img');
        img.className = 'gallery-img';
        img.src = url;
        img.alt = `Photo ${i + 1}`;
        img.addEventListener('click', () => openLightbox(i));
        galleryGrid.appendChild(img);
      });
    }
    galleryModal.classList.add('open');
  }

  /* ─── LIGHTBOX ───────────────────────────────────────── */
  function openLightbox(index) {
    lightboxIndex = index;
    lightboxImg.src = gallery[index];
    lightbox.classList.add('open');
    galleryModal.classList.remove('open');
  }

  closeLightbox.addEventListener('click', () => lightbox.classList.remove('open'));

  downloadBtn.addEventListener('click', () => {
    if (lightboxIndex < 0) return;
    const a = document.createElement('a');
    a.href = gallery[lightboxIndex];
    a.download = `lumiere-${Date.now()}.jpg`;
    a.click();
    showToast('Photo saved!');
  });

  deleteLbBtn.addEventListener('click', () => {
    if (lightboxIndex < 0) return;
    gallery.splice(lightboxIndex, 1);
    lightbox.classList.remove('open');
    if (gallery.length > 0) updateGalleryThumb(gallery[gallery.length - 1]);
    else galleryThumb.innerHTML = '<div class="placeholder">🖼</div>';
    showToast('Photo deleted');
  });

  /* ─── SHUTTER BUTTON ─────────────────────────────────── */
  let shutterHoldTimer = null;

  shutter.addEventListener('pointerdown', () => {
    if (shootMode === 'burst') {
      startBurst();
    } else {
      // Hold 1s for burst, tap for single
      shutterHoldTimer = setTimeout(() => {
        startBurst();
        shutterHoldTimer = null;
      }, 800);
    }
  });

  shutter.addEventListener('pointerup', () => {
    if (shutterHoldTimer !== null) {
      clearTimeout(shutterHoldTimer);
      shutterHoldTimer = null;
      capturePhoto();
    }
    if (burstActive && shootMode !== 'burst') stopBurst();
  });

  /* ─── FLIP CAMERA ────────────────────────────────────── */
  flipBtn.addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera();
    showToast(facingMode === 'user' ? 'Front camera' : 'Rear camera');
  });

  /* ─── START BUTTON ───────────────────────────────────── */
  startCamBtn.addEventListener('click', startCamera);

  /* ─── CLOCK ──────────────────────────────────────────── */
  function updateClock() {
    const now = new Date();
    timeDisplay.textContent =
      now.getHours().toString().padStart(2,'0') + ':' +
      now.getMinutes().toString().padStart(2,'0');
  }
  updateClock();
  setInterval(updateClock, 15000);

  /* ─── TOAST ──────────────────────────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  /* ─── RESIZE ─────────────────────────────────────────── */
  window.addEventListener('resize', () => {
    if (cameraReady) resizeCanvas();
  });

  /* ─── KEYBOARD SHORTCUTS (external keyboard) ─────────── */
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      capturePhoto();
    }
    if (e.code === 'ArrowRight') {
      const idx = FILTERS.findIndex(f => f.id === activeFilter);
      setFilter(FILTERS[(idx + 1) % FILTERS.length].id);
    }
    if (e.code === 'ArrowLeft') {
      const idx = FILTERS.findIndex(f => f.id === activeFilter);
      setFilter(FILTERS[(idx - 1 + FILTERS.length) % FILTERS.length].id);
    }
    if (e.code === 'KeyG') openGallery();
    if (e.code === 'KeyF') {
      facingMode = facingMode === 'environment' ? 'user' : 'environment';
      startCamera();
    }
  });

  /* ─── PREVENT CONTEXT MENU ON LONG PRESS ─────────────── */
  liveCanvas.addEventListener('contextmenu', e => e.preventDefault());

  /* ─── AUTO-START ─────────────────────────────────────── */
  // Try to auto-start camera. If it fails, show the start button.
  startCamera().catch(() => {});

  /* ─── BOOT ───────────────────────────────────────────── */
  buildFilterStrip();
  updateHUDExposure();

})();
