// src/components/documentViewer/PdfViewer.tsx
// Renders a decrypted local .pdf file using pdfViewerHtml.ts inside a
// react-native-webview — see that file's header comment for why (fully
// offline, no react-native-pdf, because that library's New Architecture
// support is still shaky on iOS as of writing). Reads the file itself
// (base64) rather than the caller doing it, so document.tsx just hands
// this component a local URI and stays a thin router between file types.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { AlertCircle } from 'lucide-react-native';
import { buildPdfViewerHtml } from '../../services/documentViewers/pdfViewerHtml';
import { parseViewerMessage } from '../../services/documentViewers/viewerMessages';
import { ViewerProgressPill } from './ViewerProgressPill';
import { useTheme } from '../../contexts/ThemeContext';

// Deliberately theme-independent — matches Drive's own PDF preview, which
// is always a neutral light-gray backdrop with white pages regardless of
// the host app's light/dark mode. Same rationale video.tsx/image.tsx give
// for their own fixed CANVAS_BG.
const CANVAS_BG = '#E9EDF2';

export function PdfViewer({ localUri }: { localUri: string }) {
  const { colors } = useTheme();
  const [base64, setBase64] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pillLabel, setPillLabel] = useState<string | null>(null);
  const pillTick = useRef(0);
  const [pillTickState, setPillTickState] = useState(0);

  useEffect(() => {
    let mounted = true;
    FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
      .then((b64) => { if (mounted) setBase64(b64); })
      .catch((err) => { if (mounted) setLoadError(String(err?.message || err)); });
    return () => { mounted = false; };
  }, [localUri]);

  // react-native-webview has no web implementation (its own fallback is a
  // plain "does not support this platform" stub) — on web, hand the browser
  // its own native PDF viewer via a data: URI instead of pdf.js-in-a-WebView.
  const html = useMemo(() => (base64 && Platform.OS !== 'web' ? buildPdfViewerHtml(base64, CANVAS_BG) : null), [base64]);
  const source = useMemo(() => (html ? { html } : undefined), [html]);

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = parseViewerMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === 'progress') {
      setPillLabel(`${msg.current} / ${msg.total}`);
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
        <Text style={styles.errorText}>Couldn&apos;t open this PDF</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    if (!base64) {
      return (
        <View style={[styles.center, { backgroundColor: CANVAS_BG }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return (
      <View style={[styles.flex1, { backgroundColor: CANVAS_BG }]}>
        <iframe src={`data:application/pdf;base64,${base64}`} style={styles.webFrame as any} title="PDF" />
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
            <Text style={styles.errorText}>Couldn&apos;t open this PDF</Text>
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
