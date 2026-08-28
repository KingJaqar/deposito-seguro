// src/services/documentViewers/pageChrome.ts
// Shared HTML/CSS/JS shell for the two "flowed HTML" viewers — DOCX (via
// mammoth, docxViewerHtml.ts) and ODT (via odtToHtml.ts) — both of which
// end up as a single HTML fragment that this file renders as one
// continuous white "page" card on a gray backdrop (Drive/Docs' look).
//
// Unlike the PDF viewer, a flowed HTML document has no fixed page
// geometry to paginate against without reflow-and-measure work well
// outside this scope, so this renders as one long page rather than
// Word/Docs-style discrete pages — the same simplification most in-app
// docx previewers make. Pinch-zoom is a plain CSS `transform: scale()` on
// the page card: unlike the PDF canvas, HTML text is vector/DOM, so it
// stays crisp at any zoom with no re-render/settle step needed.
//
// Communicates back to RN with the same postMessage protocol shape as
// pdfViewerHtml.ts so PdfViewer/FlowDocViewer can share one message
// handler shape in document.tsx:
//   {type:'ready'}
//   {type:'progress', current, total}  -- current/total are 0-100 scroll %, not pages
//   {type:'tap'}
//   {type:'error', message}

export const PAGE_CHROME_CSS = `
  html, body { margin: 0; padding: 0; height: 100%; overscroll-behavior: none; background: __BG__; }
  #scroller { position: absolute; inset: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
  #stage { display: flex; justify-content: center; padding: 16px 12px 48px; transform-origin: top center; }
  #page {
    background: #FFFFFF;
    width: 100%;
    max-width: 700px;
    min-height: 400px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12);
    padding: 40px 32px;
    box-sizing: border-box;
    font: 400 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1F2937;
    word-wrap: break-word;
  }
  #page h1, #page h2, #page h3 { font-weight: 700; line-height: 1.3; color: #0B1220; }
  #page h1 { font-size: 26px; margin: 0 0 16px; }
  #page h2 { font-size: 21px; margin: 20px 0 12px; }
  #page h3 { font-size: 17px; margin: 16px 0 10px; }
  #page p { margin: 0 0 12px; }
  #page ul, #page ol { margin: 0 0 12px; padding-left: 24px; }
  #page li { margin-bottom: 4px; }
  #page table { border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 14px; }
  #page td, #page th { border: 1px solid #DCE3EC; padding: 6px 10px; text-align: left; vertical-align: top; }
  #page img { max-width: 100%; height: auto; }
  #page a { color: #1D4ED8; }
  #loading, #err { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; padding: 24px; text-align: center; font: 500 14px -apple-system, Roboto, sans-serif; color: #90A0B4; }
  #err { display: none; }
`;

// Bootstrap script assumes the document-specific script (mammoth's
// conversion, or plain assignment for ODT) has already set
// `window.__setPageHtml(html)` up and will call it once the body HTML is
// ready. Kept as a function call (not a raw string the caller injects)
// so both callers — docxViewerHtml (async, post-mammoth) and the ODT
// path (already has the HTML synchronously) — drive it the same way.
export const PAGE_CHROME_SCRIPT = `
(function () {
  'use strict';
  function post(msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  window.onerror = function (message) { post({ type: 'error', message: String(message) }); return true; };

  var scroller = document.getElementById('scroller');
  var stage = document.getElementById('stage');
  var pageEl = document.getElementById('page');
  var loadingEl = document.getElementById('loading');
  var errEl = document.getElementById('err');

  var MIN_ZOOM = 0.75, MAX_ZOOM = 3;
  var zoom = 1;

  window.__setPageHtml = function (html) {
    pageEl.innerHTML = html;
    loadingEl.style.display = 'none';
    post({ type: 'ready' });
    reportProgress();
  };
  window.__setPageError = function (message) {
    loadingEl.style.display = 'none';
    errEl.style.display = 'flex';
    post({ type: 'error', message: String(message) });
  };

  var lastPct = -1;
  function reportProgress() {
    var max = scroller.scrollHeight - scroller.clientHeight;
    var pct = max > 0 ? Math.round((scroller.scrollTop / max) * 100) : 100;
    if (pct !== lastPct) { lastPct = pct; post({ type: 'progress', current: pct, total: 100 }); }
  }
  var raf = null;
  scroller.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = null; reportProgress(); });
  }, { passive: true });

  // Pinch-zoom: plain CSS transform, no re-render needed (see file header).
  var pinch = null;
  function dist(a, b) { var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY; return Math.sqrt(dx * dx + dy * dy); }
  scroller.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) pinch = { d0: dist(e.touches[0], e.touches[1]), z0: zoom };
  }, { passive: true });
  scroller.addEventListener('touchmove', function (e) {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.z0 * (dist(e.touches[0], e.touches[1]) / pinch.d0)));
      stage.style.transform = 'scale(' + zoom + ')';
    }
  }, { passive: false });
  function endPinch() { pinch = null; }
  scroller.addEventListener('touchend', endPinch);
  scroller.addEventListener('touchcancel', endPinch);

  var lastTap = 0;
  scroller.addEventListener('touchend', function (e) {
    if (e.changedTouches.length !== 1 || pinch) return;
    var now = Date.now();
    if (now - lastTap < 300) {
      zoom = zoom > 1.01 ? 1 : 1.6;
      stage.style.transform = 'scale(' + zoom + ')';
      lastTap = 0;
    } else {
      lastTap = now;
      post({ type: 'tap' });
    }
  });
})();
`;

export function buildFlowDocShell(bodyScript: string, backgroundColor: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>${PAGE_CHROME_CSS.replace('__BG__', backgroundColor)}</style>
</head>
<body>
<div id="scroller"><div id="stage"><div id="page"></div></div></div>
<div id="loading">Loading document…</div>
<div id="err">Couldn't render this document.</div>
<script>${PAGE_CHROME_SCRIPT}</script>
<script>${bodyScript}</script>
</body>
</html>`;
}
