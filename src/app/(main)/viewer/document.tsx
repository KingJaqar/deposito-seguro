import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function DocumentViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const colors = useThemeColors();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);
  
  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const decryptedUriRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);

  useEffect(() => {
    let mounted = true;
    decryptedUriRef.current = null;
    
    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let outPath = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          outPath = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
          decryptedUriRef.current = outPath;
        }
        
        if (fileMeta.mimeType.startsWith('text/')) {
          try {
            const content = await FileSystem.readAsStringAsync(outPath, { 
              encoding: FileSystem.EncodingType.UTF8 
            });
            setFileContent(content);
          } catch {
            console.error('Could not read text content');
          }
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
  }, [fileId, fileMeta]);

  const handleOpenExternally = async () => {
    if (decryptedUri) {
      try {
        await Sharing.shareAsync(decryptedUri);
      } catch {
        Alert.alert('Error', 'Could not open document');
      }
    }
  };

  const isText = fileMeta?.mimeType.startsWith('text/');

  if (isText && fileContent) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title={fileMeta?.name || 'Document Canvas'} showBack />
        <ScrollView style={styles.textContainer}>
          <Text style={[styles.textContent, { color: colors.text }]}>
            {fileContent}
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title={fileMeta ? fileMeta.name : 'Document Canvas'} showBack />
      <View style={styles.viewport}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : decryptedUri ? (
          Platform.OS === 'web' ? (
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
              <TouchableOpacity 
                style={[styles.openButton, { backgroundColor: colors.primary }]}
                onPress={handleOpenExternally}
              >
                <Text style={styles.openButtonText}>Open Document Securely</Text>
              </TouchableOpacity>
              <View style={styles.metaRow}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>Offline Sandbox URI:</Text>
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
  root: { flex: 1 , paddingTop: 50},
  viewport: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  textContainer: { flex: 1, padding: 16 },
  textContent: { fontSize: 16, lineHeight: 24 },
  webIframe: { width: '100%', height: '100%' } as any,
  docIcon: { fontSize: 64, marginBottom: 16 },
  docTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  openButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, marginBottom: 24 },
  openButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  metaRow: { width: '100%', marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 16 },
  uriText: { fontSize: 12, marginTop: 4, fontFamily: 'monospace' }
});