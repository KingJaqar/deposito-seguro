import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';
import { useVaultStore } from '../../../store/vaultStore';

export default function DocumentViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const colors = useThemeColors();
  const { files } = useVaultStore();
  
  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const decryptedUriRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);

  useEffect(() => {
    let mounted = true;
    decryptedUriRef.current = null;
    
    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let outPath = fileMeta.localPath;
        if (fileMeta.isEncrypted) {
          outPath = await StorageService.decryptSandboxFile(fileMeta.localPath);
          decryptedUriRef.current = outPath;
        }
        if (mounted) {
          decryptedUriRef.current = outPath;
          setDecryptedUri(outPath);
        }
      } catch (err) {
        console.error('Failed parsing document pipeline payload structures.', err);
        if (mounted) setDecryptedUri(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    loadFile();

    return () => {
      if (fileMeta && fileMeta.isEncrypted && decryptedUriRef.current) {
        StorageService.removeSandboxFile(decryptedUriRef.current).catch(e => console.error(e));
      }
    };
  }, [fileId]);

  const isPdf = fileMeta?.mimeType === 'application/pdf';
  const isText = fileMeta?.mimeType.startsWith('text/');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title={fileMeta ? fileMeta.name : 'Document Canvas'} showBack />
      <View style={styles.viewport}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : decryptedUri ? (
          isPdf ? (
            <WebView
              source={{ uri: decryptedUri }}
              style={styles.webViewer}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
            />
          ) : isText ? (
            <WebView
              source={{ uri: decryptedUri }}
              style={styles.webViewer}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
            />
          ) : Platform.OS === 'web' ? (
            <iframe 
              src={decryptedUri} 
              style={styles.webIframe as any}
              title={fileMeta?.name}
            />
          ) : (
            <>
              <Text style={styles.docIcon}>📄</Text>
              <Text style={[styles.docTitle, { color: colors.text }]}>{fileMeta?.name}</Text>
              <Text style={{ color: colors.textMuted, marginBottom: 20 }}>Type: {fileMeta?.mimeType}</Text>
              <View style={styles.metaRow}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>Offline Sandbox URI Location Target:</Text>
                <Text style={[styles.uriText, { color: colors.textMuted }]} numberOfLines={3}>
                  {decryptedUri}
                </Text>
              </View>
            </>
          )
        ) : (
          <Text style={{ color: colors.error }}>Failed structural conversion of specified document signature resource.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { flex: 1, padding: 16 },
  webViewer: { flex: 1, width: '100%' },
  webIframe: { width: '100%', height: '100%' } as any,
  docIcon: { fontSize: 64, marginBottom: 16 },
  docTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  metaRow: { width: '100%', marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 16 },
  uriText: { fontSize: 12, marginTop: 4, fontFamily: 'monospace' }
});