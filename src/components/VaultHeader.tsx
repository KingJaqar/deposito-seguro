import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';

interface HeaderProps {
  title: string;
  showBack?: boolean;
}

export const VaultHeader = ({ title, showBack = false }: HeaderProps) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {showBack && (
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>← Back</Text>
        </TouchableOpacity>
      )}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  backBtn: { marginRight: 12 },
  title: { fontSize: 20, fontWeight: 'bold' }
});