import { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Trash2, X } from 'lucide-react-native';

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
}

export function DestructiveConfirmModal({ state, onClose }: Props) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Trash2 size={24} color="#EF4444" strokeWidth={2.5} />
          </View>

          <Text style={styles.title}>{state.title}</Text>
          <Text style={styles.message}>{state.message}</Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onClose}>
              <X size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.confirm]}
              onPress={() => {
                onClose();
                state.onConfirm();
              }}
            >
              <Trash2 size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.confirmText}>{state.confirmText}</Text>
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
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
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
  },
  cancel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  confirm: {
    backgroundColor: '#EF4444',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
