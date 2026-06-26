import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EncryptionKeyUnlockModal } from '../../../components/EncryptionKeyUnlockModal';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { useUnlockState } from '../../../contexts/UnlockContext';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function ImageViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const colors = useThemeColors();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);
  const { isUnlocked, markUnlocked } = useUnlockState();
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedFileId, setDismissedFileId] = useState<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);
  const isEncrypted = fileMeta?.isEncrypted && fileMeta?.encryptionKeyId;
  const needsUnlock = isEncrypted && fileId && !isUnlocked(fileId);
  const showUnlockModal = !!needsUnlock && dismissedFileId !== fileId;

  useEffect(() => {
    let mounted = true;
    
    const loadFile = async () => {
      if (!fileMeta) return;
      if (needsUnlock) return;
      
      try {
        let path = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          path = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
        }
        if (mounted) {
          setImageUri(path);
        }
      } catch (err) {
        console.error('Failed opening cryptographic asset matrix pipeline.', err);
        if (mounted) setImageUri(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    loadFile();
  }, [fileId, fileMeta, needsUnlock]);

  const handleUnlock = () => {
    if (fileId) {
      markUnlocked(fileId);
      setDismissedFileId(null);
      setLoading(true);
      setImageUri(null);
    }
  };

  const handleCancelUnlock = () => {
    setDismissedFileId(fileId);
  };

  // Show unlock modal if needed
  if (needsUnlock && fileMeta) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <SafeAreaView>
          <VaultHeader title={fileMeta.name} showBack />
          <View style={styles.viewport}>
            <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
              🔒 This image is encrypted. Unlock required.
            </Text>
          </View>
        <EncryptionKeyUnlockModal
          visible={showUnlockModal}
          itemName={fileMeta.name}
          requiredKeyId={fileMeta.encryptionKeyId!}
          onUnlock={handleUnlock}
          onCancel={handleCancelUnlock}
        />
      </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView>
        <VaultHeader title={fileMeta ? fileMeta.name : 'Image View Canvas'} showBack />
        <View style={styles.viewport}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.canvasImage}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: colors.error }}>Failed structural conversion of specified image asset.</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  canvasImage: { width: '100%', height: '100%' }
});