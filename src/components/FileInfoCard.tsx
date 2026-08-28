// src/components/FileInfoCard.tsx
// Rebuilt per §5/§7 Phase 4. Local wrapAtLength copy replaced with the shared
// utility; rendered on the Card primitive. Prop interface unchanged.
import { StyleSheet, View, Text, ViewStyle } from 'react-native';
import { File, Folder } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Card } from './primitives/Card';
import { wrapAtLength } from '../utils/wrapAtLength';

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
  const { colors, space, font, radius, iconSize } = useTheme();
  const Icon = type === 'file' ? File : Folder;
  const wrapSize = iconSize(36);

  return (
    <Card style={[{ width: '100%', maxWidth, padding: space(3) }, style]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { width: wrapSize, height: wrapSize, backgroundColor: colors.surfaceHover, borderRadius: radius(3), marginRight: space(3) }]}>
          <Icon size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
        </View>

        <View style={styles.textContainer}>
          {truncate ? (
            <Text style={[styles.name, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1} ellipsizeMode="tail">
              {name}
            </Text>
          ) : (
            wrapAtLength(name, wrapLength).map((line, index) => (
              <Text key={index} style={[styles.name, { color: colors.text, fontSize: font(Type.body.size) }]}>
                {line}
              </Text>
            ))
          )}

          {(size || modified) && (
            <Text style={[styles.meta, { color: colors.textMuted, fontSize: font(Type.caption.size), marginTop: 2 }]}>
              {[size, modified].filter(Boolean).join(' • ')}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textContainer: { flex: 1, overflow: 'hidden' },
  name: { fontWeight: '600' },
  meta: { fontWeight: '500' },
});
