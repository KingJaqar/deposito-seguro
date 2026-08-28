// src/components/DestructiveConfirmModal.tsx
// Rebuilt on the Dialog primitive per §5 — this component's original shape is
// what Dialog was modeled on, so it now simply consumes it. The
// useConfirmDestructive hook is kept EXACTLY as-is (§5 "kept as-is"): same
// state shape, same confirm()/close() signatures, same call order in which
// onClose() runs before state.onConfirm(). Every caller is unaffected.
import { useCallback, useState } from 'react';
import { ViewStyle } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Dialog } from './primitives/Dialog';

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

export function DestructiveConfirmModal({ state, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <Dialog
      visible={state.visible}
      onRequestClose={onClose}
      icon={Trash2}
      iconColor={colors.error}
      title={state.title}
      message={state.message}
      actions={[
        { label: 'Cancel', onPress: onClose, variant: 'tertiary' },
        {
          label: state.confirmText,
          variant: 'danger',
          onPress: () => {
            onClose();
            state.onConfirm();
          },
        },
      ]}
    />
  );
}
