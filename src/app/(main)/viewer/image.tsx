import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';
import { useVaultStore } from '../../../store/vaultStore';

export default function ImageViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const colors = useThemeColors();
  const { files } = useVaultStore();
  
  const [imageUri, setImageUri] = useState<string | null>(null);
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

    return () => {
      // Cleanup will happen on next view
    };
  }, [fileId]);

  // Get file content as base64 for web/native compatibility
  useEffect(() => {
    if (!loading && imageUri && decryptedPathRef.current) {
      // File is ready
      console.log('Image ready:', imageUri);
    }
  }, [loading, imageUri]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  canvasImage: { width: '100%', height: '100%' }
});