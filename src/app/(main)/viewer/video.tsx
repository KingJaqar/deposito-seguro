import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';
import { useVaultStore } from '../../../store/vaultStore';

export default function VideoViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId?: string }>();
  const colors = useThemeColors();
  const { files } = useVaultStore();
  
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const decryptedPathRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);

  useEffect(() => {
    let mounted = true;
    decryptedPathRef.current = null;
    
    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let path = fileMeta.localPath;
        if (fileMeta.isEncrypted) {
          path = await StorageService.decryptSandboxFile(fileMeta.localPath);
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
  }, [fileId]);

  const player = useVideoPlayer(videoUri || null, (player) => {
    player.loop = false;
  });

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