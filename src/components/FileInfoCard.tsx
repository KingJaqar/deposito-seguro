import { StyleSheet, View, Text, ViewStyle } from 'react-native';
import { File, Folder } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

const wrapAtLength = (text: string, maxLength = 60): string[] => {
  if (!text) return [];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    lines.push(text.slice(i, i + maxLength));
  }
  return lines;
};

type FileInfoCardProps = {
  name: string;
  type: 'file' | 'folder';
  size?: string;
  modified?: string;
  maxWidth?: number;
  wrapLength?: number;
  truncate?: boolean;
  style?: ViewStyle;
};

export function FileInfoCard({ name, type, size, modified, maxWidth = 360, wrapLength = 60, truncate = false, style }: FileInfoCardProps) {
  const { colors, space, radius } = useTheme();

  const Icon = type === 'file' ? File : Folder;

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        maxWidth,
        borderRadius: radius(12),
        padding: space(3)
      },
      style
    ]}>
      <View style={styles.iconContainer}>
        <Icon size={20} color={colors.textMuted} />
      </View>

      <View style={styles.textContainer}>
        {truncate ? (
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {name}
          </Text>
        ) : (
          wrapAtLength(name, wrapLength).map((line, index) => (
            <Text
              key={index}
              style={[styles.name, { color: colors.text }]}
            >
              {line}
            </Text>
          ))
        )}

        {(size || modified) && (
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {[size, modified].filter(Boolean).join(' • ')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    opacity: 0.8,
  },
});