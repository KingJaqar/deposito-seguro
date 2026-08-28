// src/services/documentViewers/docxViewerHtml.ts
// Builds the self-contained HTML document PdfViewer's sibling, FlowDocViewer,
// loads for .docx files. mammoth.js runs inside the WebView (a real DOM/
// browser JS engine) rather than in the RN/Hermes thread — mammoth's
// browser build leans on browser globals (Blob-based image data URIs, etc.)
// that Hermes doesn't provide, and this way the exact same offline,
// no-network-permission constraint that shaped pdfViewerHtml.ts is
// satisfied the same way: the docx's own bytes (base64) and mammoth's
// library source are both baked directly into this HTML string.
import mammothLibSource from './vendor/mammothLibSource.generated';
import { buildFlowDocShell } from './pageChrome';

export function buildDocxViewerHtml(base64Docx: string, backgroundColor: string): string {
  const bodyScript = `
${mammothLibSource}
(function () {
  'use strict';
  function base64ToArrayBuffer(b64) {
    var raw = atob(b64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }
  var arrayBuffer = base64ToArrayBuffer(${JSON.stringify(base64Docx)});
  window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
    .then(function (result) { window.__setPageHtml(result.value || '<p style="color:#90A0B4">This document has no readable text content.</p>'); })
    .catch(function (err) { window.__setPageError((err && err.message) || err); });
})();
`;
  return buildFlowDocShell(bodyScript, backgroundColor);
}
