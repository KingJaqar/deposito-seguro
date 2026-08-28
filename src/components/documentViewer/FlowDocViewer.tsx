// src/components/documentViewer/FlowDocViewer.tsx
// Renders a decrypted local .docx or .odt file as a single continuous
// "page" card (see pageChrome.ts) inside a react-native-webview. DOCX goes
// through mammoth.js (docxViewerHtml.ts, converted client-side inside the
// WebView); ODT goes through the hand-rolled converter in odtToHtml.ts
// (run in RN, since it's a plain string transform with no DOM need) and is
// then handed to the same page-card shell. `kind` picks which path runs;
// everything else about the two is identical from here down.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { AlertCircle } from 'lucide-react-native';
import { buildDocxViewerHtml } from '../../services/documentViewers/docxViewerHtml';
import { buildFlowDocShell } from '../../services/documentViewers/pageChrome';
import { convertOdtToHtml } from '../../services/documentViewers/odtToHtml';
import { parseViewerMessage } from '../../services/documentViewers/viewerMessages';
import { ViewerProgressPill } from './ViewerProgressPill';
import { useTheme } from '../../contexts/ThemeContext';

// Same rationale as PdfViewer's CANVAS_BG — Drive's page previews are a
// fixed light-gray backdrop regardless of the host app's theme.
const CANVAS_BG = '#E9EDF2';

export function FlowDocViewer({ localUri, kind }: { localUri: string; kind: 'docx' | 'odt' }) {
  const { colors } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pillLabel, setPillLabel] = useState<string | null>(null);
  const pillTick = useRef(0);
  const [pillTickState, setPillTickState] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (kind === 'docx') {
          const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          if (mounted) setHtml(buildDocxViewerHtml(base64, CANVAS_BG));
        } else {
          const bodyHtml = await convertOdtToHtml(localUri);
          const escaped = JSON.stringify(bodyHtml);
          if (mounted) setHtml(buildFlowDocShell(`window.__setPageHtml(${escaped});`, CANVAS_BG));
        }
      } catch (err: any) {
        if (mounted) setLoadError(String(err?.message || err));
      }
    })();
    return () => { mounted = false; };
  }, [localUri, kind]);

  const source = useMemo(() => (html ? { html } : undefined), [html]);

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = parseViewerMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === 'progress' && msg.current > 0 && msg.current < 100) {
      setPillLabel(`${msg.current}%`);
      pillTick.current += 1;
      setPillTickState(pillTick.current);
    } else if (msg.type === 'error') {
      setLoadError(msg.message);
    }
  };

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: CANVAS_BG }]}>
        <AlertCircle size={32} color={colors.error} strokeWidth={1.75} />
        <Text style={styles.errorText}>{kind === 'docx' ? "Couldn't open this document" : "Couldn't open this ODF document"}</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View style={[styles.center, { backgroundColor: CANVAS_BG }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // react-native-webview has no web implementation — the generated HTML
  // (mammoth-in-page for docx, or the pre-converted ODT body) is just as
  // valid loaded straight into a plain <iframe srcDoc>, no WebView needed.
  // The progress pill is a native-only nicety here: the page's postMessage
  // calls no-op harmlessly when window.ReactNativeWebView isn't defined.
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.flex1, { backgroundColor: CANVAS_BG }]}>
        <iframe srcDoc={html ?? undefined} style={styles.webFrame as any} title={kind === 'docx' ? 'Document' : 'ODF Document'} />
      </View>
    );
  }

  return (
    <View style={[styles.flex1, { backgroundColor: CANVAS_BG }]}>
      <WebView
        originWhitelist={['*']}
        source={source}
        onMessage={onMessage}
        style={styles.flex1}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        renderError={() => (
          <View style={[styles.center, { backgroundColor: CANVAS_BG }]}>
            <AlertCircle size={32} color={colors.error} strokeWidth={1.75} />
            <Text style={styles.errorText}>Couldn&apos;t open this document</Text>
          </View>
        )}
      />
      <ViewerProgressPill label={pillLabel} tick={pillTickState} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorText: { fontSize: 14, fontWeight: '600', color: '#617187' },
  webFrame: { width: '100%', height: '100%', border: 'none' } as any,
});
