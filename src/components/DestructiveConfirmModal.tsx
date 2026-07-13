import { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Trash2, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface DestructiveConfirmState {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
}

export function useConfirmDestructive() {
  const [state, setState] = useState<DestructiveConfirmState>({
    visible: false,
    title: '',
    message: '',
    confirmText: 'Delete',
    onConfirm: () => {},
  });

  const confirm = useCallback((title: string, message: string, onConfirm: () => void, confirmText = 'Delete') => {
    setState({ visible: true, title, message, confirmText, onConfirm });
  }, []);

  const close = useCallback(() => {
    setState(prev => ({ ...prev, visible: false }));
  }, []);

  return { confirmState: state, confirm, close };
}

interface Props {
  state: DestructiveConfirmState;
  onClose: () => void;
  style?: ViewStyle;
}

export function DestructiveConfirmModal({ state, onClose, style }: Props) {
  const { space, font, radius, isTablet, isDark, colors } = useTheme();

  const cardStyle: ViewStyle = {
    width: '100%',
    maxWidth: isTablet ? 480 : 360,
    borderRadius: radius(12),
    paddingVertical: space(7),
    paddingHorizontal: space(5),
    alignItems: 'center',
    backgroundColor: isDark ? '#2A2A2A' : colors.surface,
    borderWidth: 1,
    borderColor: isDark ? colors.borderLight : colors.border,
  };

  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[cardStyle, style]}>
          <View style={[styles.iconWrap, { marginBottom: space(4) }]}>
            <Trash2 size={24} color="#EF4444" strokeWidth={2.5} />
          </View>

          <Text style={[styles.title, { marginBottom: space(2), color: isDark ? '#fff' : colors.text }]}>{state.title}</Text>
          <Text style={[styles.message, { marginBottom: space(8), color: isDark ? 'rgba(255,255,255,0.75)' : colors.textSecondary, lineHeight: 22 }]}>{state.message}</Text>

          <View style={[styles.row, { gap: space(4) }]}>
             <TouchableOpacity style={[styles.btn, styles.cancel, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.borderLight }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
                <X size={18} color={isDark ? '#fff' : colors.textSecondary} strokeWidth={2.5} />
                <Text style={[styles.cancelText, { color: isDark ? '#fff' : colors.textSecondary }]} numberOfLines={1}>Cancel</Text>
             </TouchableOpacity>
             <TouchableOpacity
               style={[styles.btn, styles.confirm]}
               onPress={() => {
                 onClose();
                 state.onConfirm();
               }}
               accessibilityRole="button"
               accessibilityLabel={state.confirmText}
             >
               <Trash2 size={18} color="#fff" strokeWidth={2.5} />
               <Text style={styles.confirmText} numberOfLines={1}>{state.confirmText}</Text>
             </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
  confirm: {
    backgroundColor: '#EF4444',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
});
