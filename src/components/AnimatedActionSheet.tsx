import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface PlainActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  closeOnSwipeDown?: boolean;
  snapPoints?: number[];
}

export const AnimatedActionSheet = ({
  visible,
  onClose,
  title,
  children,
  style,
  closeOnSwipeDown = true,
  snapPoints = [0.85],
}: PlainActionSheetProps) => {
  const { isDark, space, font, radius, isTablet } = useTheme();

  const sheetBg = isDark ? '#2A2A2A' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#111111';
  const closeBtnBg = isDark ? '#2A2A2A' : '#F5F5F5';

  const sheetStyle: ViewStyle = useMemo(() => ({
    backgroundColor: sheetBg,
    borderTopLeftRadius: radius(12),
    borderTopRightRadius: radius(12),
    borderBottomLeftRadius: radius(12),
    borderBottomRightRadius: radius(12),
    paddingTop: space(5),
    paddingBottom: space(8),
    paddingHorizontal: 0,
    overflow: 'hidden',
    width: '90%',
    maxWidth: isTablet ? 520 : 400,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  }), [space, radius, isTablet, sheetBg]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.centeringContainer}>
          <View
            style={[
              sheetStyle,
              style,
            ]}
          >
            <View style={styles.headerRow}>
              <Text
                style={[
                  styles.title,
                  { color: textColor },
                ]}
              >
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.closeButton,
                  { backgroundColor: closeBtnBg },
                ]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={textColor} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeringContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
