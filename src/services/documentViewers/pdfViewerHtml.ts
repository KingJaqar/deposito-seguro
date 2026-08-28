// src/services/documentViewers/pdfViewerHtml.ts
// Builds the self-contained HTML document that PdfViewer.tsx loads into a
// react-native-webview via `source={{ html }}`. Everything the WebView ever
// touches is already inside this one string — pdf.js's core library, its
// worker, and the PDF's own bytes (base64) — because app.json blocks
// android.permission.INTERNET outright: nothing in this vault app is
// allowed to reach the network, so there is no CDN/Google-Docs-Viewer
// fallback available even if we wanted one. See vendor/pdfLibSource and
// vendor/pdfWorkerSource for why pdfjs-dist is pinned to the last
// classic-script (non-ESM) release series.
//
// Rendering model: continuous vertical scroll of <canvas> pages (matching
// Google Drive's own PDF preview), rendered lazily via IntersectionObserver
// as they scroll near the viewport rather than all up front, with hand-
// rolled two-finger pinch-zoom (live CSS transform while pinching, then a
// crisp re-render at the committed zoom once fingers lift — the same
// "cheap live transform, expensive settle re-render" split most native PDF
// viewers use). The page communicates back to RN over
// window.ReactNativeWebView.postMessage with a tiny JSON protocol:
//   {type:'ready', totalPages}
//   {type:'progress', current, total}   -- drives the floating "n / total" pill
//   {type:'tap'}                        -- single tap on the canvas, toggles RN chrome
//   {type:'error', message}
import pdfLibSource from './vendor/pdfLibSource.generated';
import pdfWorkerSource from './vendor/pdfWorkerSource.generated';

export function buildPdfViewerHtml(base64Pdf: string, backgroundColor: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
  html, body { margin: 0; padding: 0; background: ${backgroundColor}; height: 100%; overscroll-behavior: none; }
  #scroller { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px 0 40px; transform-origin: top center; }
  .page-slot { background: #FFFFFF; box-shadow: 0 1px 4px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12); position: relative; }
  .page-slot canvas { display: block; width: 100%; height: 100%; }
  .page-slot .spinner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #90A0B4; font: 500 13px -apple-system, Roboto, sans-serif; }
  #err { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 8px; padding: 24px; text-align: center; font: 500 14px -apple-system, Roboto, sans-serif; color: #90A0B4; }
</style>
</head>
<body>
<div id="scroller"><div id="pages"></div></div>
<div id="err"><div>Couldn't render this PDF.</div></div>
<script>
${pdfLibSource}
</script>
<script>
(function () {
  'use strict';
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  window.onerror = function (message) { post({ type: 'error', message: String(message) }); return true; };

  var pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) { post({ type: 'error', message: 'pdf.js failed to load' }); return; }

  // Classic (non-module) worker via a Blob URL — no network fetch, no
  // ES-module-worker support required from the WebView engine.
  var WORKER_SOURCE = ${JSON.stringify(pdfWorkerSource)};
  var workerBlob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

  var BASE64_PDF = ${JSON.stringify(base64Pdf)};
  function base64ToBytes(b64) {
    var raw = atob(b64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  var scroller = document.getElementById('scroller');
  var pagesEl = document.getElementById('pages');
  var errEl = document.getElementById('err');

  var MIN_ZOOM = 0.75, MAX_ZOOM = 3.5;
  var zoom = 1;
  var pdfDoc = null;
  var slots = []; // { el, canvas, page, rendered, rendering, baseWidth, baseHeight }
  var currentPage = 1;
  var lastReportedPage = 0;

  function viewerWidth() { return scroller.clientWidth - 24; /* 12px side margin, matches page gap padding */ }

  function layoutSlot(slot) {
    var w = Math.max(1, viewerWidth()) * zoom;
    var h = w * (slot.baseHeight / slot.baseWidth);
    slot.el.style.width = w + 'px';
    slot.el.style.height = h + 'px';
  }

  function renderSlot(slot) {
    if (slot.rendered || slot.rendering) return;
    slot.rendering = true;
    var targetCssWidth = Math.max(1, viewerWidth()) * zoom;
    var fitScale = targetCssWidth / slot.baseWidth;
    var outputScale = Math.min(window.devicePixelRatio || 1, 2.5); // cap DPR — a 3-4x-DPR phone rendering a zoomed page shouldn't blow the canvas budget
    var viewport = slot.page.getViewport({ scale: fitScale * outputScale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var ctx = canvas.getContext('2d');
    slot.page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
      slot.el.innerHTML = '';
      slot.el.appendChild(canvas);
      slot.rendered = true;
      slot.rendering = false;
    }).catch(function () { slot.rendering = false; });
  }

  function renderVisible() {
    var top = scroller.scrollTop, bottom = top + scroller.clientHeight;
    var preload = scroller.clientHeight; // one extra screen-height of lazy-render lookahead in each direction
    slots.forEach(function (slot) {
      var slotTop = slot.el.offsetTop, slotBottom = slotTop + slot.el.offsetHeight;
      if (slotBottom > top - preload && slotTop < bottom + preload) renderSlot(slot);
    });
  }

  function updateCurrentPage() {
    var mid = scroller.scrollTop + scroller.clientHeight * 0.4;
    var page = 1;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].el.offsetTop <= mid) page = i + 1; else break;
    }
    currentPage = page;
    if (currentPage !== lastReportedPage) {
      lastReportedPage = currentPage;
      post({ type: 'progress', current: currentPage, total: slots.length });
    }
  }

  var scrollRaf = null;
  scroller.addEventListener('scroll', function () {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function () { scrollRaf = null; renderVisible(); updateCurrentPage(); });
  }, { passive: true });
  window.addEventListener('resize', function () { slots.forEach(layoutSlot); renderVisible(); });

  // --- Pinch-zoom: live CSS transform while two fingers are down (cheap),
  // then re-render the affected pages at native resolution for the new
  // zoom once the gesture ends (crisp) — see file header comment.
  var pinch = null, pendingZoom = null;
  function dist(a, b) { var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY; return Math.sqrt(dx * dx + dy * dy); }
  scroller.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinch = { d0: dist(e.touches[0], e.touches[1]), z0: zoom };
    }
  }, { passive: true });
  scroller.addEventListener('touchmove', function (e) {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      var next = pinch.z0 * (dist(e.touches[0], e.touches[1]) / pinch.d0);
      next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      pendingZoom = next;
      pagesEl.style.transform = 'scale(' + (next / zoom) + ')';
    }
  }, { passive: false });
  function endPinch() {
    if (!pinch) return;
    pinch = null;
    pagesEl.style.transform = '';
    if (pendingZoom && pendingZoom !== zoom) {
      zoom = pendingZoom;
      slots.forEach(function (s) { s.rendered = false; s.rendering = false; layoutSlot(s); });
      renderVisible();
    }
    pendingZoom = null;
  }
  scroller.addEventListener('touchend', endPinch);
  scroller.addEventListener('touchcancel', endPinch);

  // Double-tap: toggle between fit-width and 2x, same affordance most
  // reader apps offer as a pinch shortcut.
  var lastTap = 0;
  scroller.addEventListener('touchend', function (e) {
    if (e.changedTouches.length !== 1 || pinch) return;
    var now = Date.now();
    if (now - lastTap < 300) {
      zoom = zoom > 1.01 ? 1 : 2;
      slots.forEach(function (s) { s.rendered = false; s.rendering = false; layoutSlot(s); });
      renderVisible();
      lastTap = 0;
    } else {
      lastTap = now;
      post({ type: 'tap' });
    }
  });

  pdfjsLib.getDocument({ data: base64ToBytes(BASE64_PDF) }).promise.then(function (pdf) {
    pdfDoc = pdf;
    var pageNums = [];
    for (var n = 1; n <= pdf.numPages; n++) pageNums.push(n);
    return pageNums.reduce(function (chain, n) {
      return chain.then(function () { return pdf.getPage(n); }).then(function (page) {
        var vp = page.getViewport({ scale: 1 });
        var el = document.createElement('div');
        el.className = 'page-slot';
        var spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.textContent = 'Page ' + n;
        el.appendChild(spinner);
        pagesEl.appendChild(el);
        var slot = { el: el, page: page, baseWidth: vp.width, baseHeight: vp.height, rendered: false, rendering: false };
        slots.push(slot);
        layoutSlot(slot);
      });
    }, Promise.resolve());
  }).then(function () {
    post({ type: 'ready', totalPages: slots.length });
    lastReportedPage = 0;
    // A tiny/fast PDF can finish parsing before the browser has completed
    // its first layout pass, so scroller.clientWidth (which every slot's
    // width/height was just computed from) can still read 0 here — a
    // double rAF guarantees at least one real layout+paint has happened,
    // then re-measures and re-renders at the now-correct width.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        slots.forEach(layoutSlot);
        renderVisible();
        updateCurrentPage();
      });
    });
  }).catch(function (err) {
    errEl.style.display = 'flex';
    post({ type: 'error', message: String((err && err.message) || err) });
  });
})();
</script>
</body>
</html>`;
}
