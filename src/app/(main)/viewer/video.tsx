import { useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { EncryptionKeyUnlockModal } from '../../../components/EncryptionKeyUnlockModal';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { useUnlockState } from '../../../contexts/UnlockContext';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function VideoViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId?: string }>();
  const colors = useThemeColors();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);
  const { isUnlocked, markUnlocked } = useUnlockState();
  
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const decryptedPathRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);
  const isEncrypted = fileMeta?.isEncrypted && fileMeta?.encryptionKeyId;
  const needsUnlock = isEncrypted && fileId && !isUnlocked(fileId);

  useEffect(() => {
    let mounted = true;
    decryptedPathRef.current = null;
    
    // If file is encrypted and not unlocked, show unlock modal
    if (needsUnlock) {
      setShowUnlockModal(true);
      return;
    }
    
    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let path = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          path = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
          decryptedPathRef.current = path;
        }
        if (mounted) {
          setVideoUri(path);
        }
      } catch (err) {
        console.error('Failed opening cryptographic video asset pipeline.', err);
        if (mounted) setVideoUri(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    loadFile();
  }, [fileId, fileMeta, needsUnlock]);

  const handleUnlock = () => {
    if (fileId) {
      markUnlocked(fileId);
      setShowUnlockModal(false);
      // Reload the file after unlocking
      setLoading(true);
      setVideoUri(null);
    }
  };

  const handleCancelUnlock = () => {
    setShowUnlockModal(false);
  };

  const player = useVideoPlayer(videoUri || null, (player) => {
    player.loop = false;
  });

  // Show unlock modal if needed
  if (needsUnlock && fileMeta) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title={fileMeta.name} showBack />
        <View style={styles.viewport}>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
            🔒 This video is encrypted. Unlock required.
          </Text>
        </View>
        <EncryptionKeyUnlockModal
          visible={showUnlockModal}
          itemName={fileMeta.name}
          requiredKeyId={fileMeta.encryptionKeyId!}
          onUnlock={handleUnlock}
          onCancel={handleCancelUnlock}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
        <View style={styles.viewport}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!videoUri) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
        <View style={styles.viewport}>
          <Text style={{ color: colors.error }}>Failed structural conversion of specified video asset.</Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
        <View style={styles.viewport}>
          <video 
            src={videoUri} 
            controls 
            autoPlay
            style={styles.videoElement as any}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
      <View style={styles.viewport}>
        <VideoView 
          style={styles.videoElement}
          player={player}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  videoElement: { width: '100%', height: 300, borderRadius: 12 },
});