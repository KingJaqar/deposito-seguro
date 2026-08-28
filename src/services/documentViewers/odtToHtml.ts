// src/services/documentViewers/odtToHtml.ts
// .odt -> HTML fragment, for the same buildFlowDocShell page card DOCX
// uses. Unlike DOCX there's no mammoth-grade converter for ODF text
// documents worth pulling in, so this is a small hand-rolled one: an ODT
// is a zip (JSZip — already a project dependency via backupService.ts)
// containing content.xml, whose body is ODF-namespaced XML
// (<text:p>, <text:h>, <text:list>, <table:table>, ...).
//
// Hermes has no DOMParser, so this doesn't build a real XML tree — it
// walks content.xml with a fixed sequence of regex substitutions, converting
// only the handful of ODF elements that matter for a readable preview
// (paragraphs, headings, lists, tables, line/tab breaks) into their HTML
// equivalents, then strips every ODF tag it didn't explicitly convert.
// That last step is what keeps this safe despite not being a real parser:
// every ODF element name is namespaced (`text:`, `table:`, `draw:`, …)
// while every tag this file introduces is not, so a single
// `/<\/?[\w-]+:[^>]*>/g` pass removes all the untranslated ODF markup
// (inline character styling, embedded images, footnotes, ...) without
// touching the HTML already substituted in. The result: correct reading
// order and paragraph/heading/list/table structure, but no font/color
// styling and no images — a materially simpler preview than the DOCX
// path, which is why document.tsx labels it "Simplified preview".
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';

function escapeUnknownEntities(xml: string): string {
  // content.xml is well-formed XML; the entities that matter for visible
  // text (&amp; &lt; &gt; &quot; &apos; and numeric &#NN;) are all valid
  // HTML too, so nothing needs decoding here.
  return xml;
}

function convertParagraphsAndHeadings(xml: string): string {
  let out = xml;
  // Headings: <text:h text:outline-level="N" ...>...</text:h> -> <hN>
  out = out.replace(/<text:h[^>]*text:outline-level="(\d)"[^>]*>([\s\S]*?)<\/text:h>/g, (_m, level, inner) => {
    const n = Math.min(6, Math.max(1, parseInt(level, 10) || 1));
    return `<h${n}>${inner}</h${n}>`;
  });
  // Any heading tag that slipped through without a matched outline-level attr.
  out = out.replace(/<text:h[^>]*>([\s\S]*?)<\/text:h>/g, '<h3>$1</h3>');
  out = out.replace(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g, '<p>$1</p>');
  return out;
}

function convertInlineAndBreaks(xml: string): string {
  let out = xml;
  out = out.replace(/<text:line-break\s*\/>/g, '<br/>');
  out = out.replace(/<text:tab[^/]*\/>/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  out = out.replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_m, count) => '&nbsp;'.repeat(Math.min(20, parseInt(count, 10) || 1)));
  out = out.replace(/<text:s\s*\/>/g, '&nbsp;');
  out = out.replace(/<text:span[^>]*>([\s\S]*?)<\/text:span>/g, '<span>$1</span>');
  return out;
}

function convertListsAndTables(xml: string): string {
  let out = xml;
  out = out.replace(/<text:list-item[^>]*>/g, '<li>').replace(/<\/text:list-item>/g, '</li>');
  out = out.replace(/<text:list[^>]*>/g, '<ul>').replace(/<\/text:list>/g, '</ul>');
  out = out.replace(/<table:table-cell[^>]*>/g, '<td>').replace(/<\/table:table-cell>/g, '</td>');
  out = out.replace(/<table:table-row[^>]*>/g, '<tr>').replace(/<\/table:table-row>/g, '</tr>');
  out = out.replace(/<table:table[^>]*>/g, '<table>').replace(/<\/table:table>/g, '</table>');
  return out;
}

function stripRemainingOdfTags(xml: string): string {
  // Anything still namespaced (contains a colon in the tag name) is ODF
  // markup this file didn't explicitly translate — drop it, keeping only
  // the plain (non-namespaced) HTML tags introduced above.
  return xml.replace(/<\/?[a-zA-Z][\w.-]*:[^>]*>/g, '');
}

// Pure string transform, no RN/JSZip dependency — split out so it's
// directly unit-testable (e.g. via `tsx`) without expo-file-system or a
// real .odt file, and reusable if odt content.xml ever needs converting
// from a source other than a local file.
export function odfContentXmlToHtml(xml: string): string {
  const bodyStart = xml.indexOf('<office:text');
  const bodyEnd = xml.lastIndexOf('</office:text>');
  if (bodyStart === -1 || bodyEnd === -1) throw new Error('Could not locate document body');
  const bodyOpenEnd = xml.indexOf('>', bodyStart);
  const inner = xml.slice(bodyOpenEnd + 1, bodyEnd);

  let html = escapeUnknownEntities(inner);
  html = convertListsAndTables(html);
  html = convertParagraphsAndHeadings(html);
  html = convertInlineAndBreaks(html);
  html = stripRemainingOdfTags(html);
  html = html.trim();

  return html || '<p style="color:#90A0B4">This document has no readable text content.</p>';
}

export async function convertOdtToHtml(localPath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('Not a valid ODF document (missing content.xml)');
  const xml = await contentFile.async('text');
  return odfContentXmlToHtml(xml);
}
