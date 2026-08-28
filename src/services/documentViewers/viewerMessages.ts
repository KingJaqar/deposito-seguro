// src/services/documentViewers/viewerMessages.ts
// Shared postMessage protocol between the WebView-hosted viewers
// (pdfViewerHtml.ts, pageChrome.ts) and their RN wrappers (PdfViewer.tsx,
// FlowDocViewer.tsx).
export type ViewerMessage =
  | { type: 'ready'; totalPages?: number }
  | { type: 'progress'; current: number; total: number }
  | { type: 'tap' }
  | { type: 'error'; message: string };

export function parseViewerMessage(raw: string): ViewerMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.type === 'string') return parsed as ViewerMessage;
  } catch {
    // ignore malformed messages
  }
  return null;
}
