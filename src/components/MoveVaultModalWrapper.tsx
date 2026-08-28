import { useMove } from '../contexts/MoveVaultContext';
import { MoveVaultModal } from './MoveVaultModal';
import { TopToast, useTopToast } from './primitives/TopToast';

export function MoveVaultModalWrapper() {
  const { visible, item, folders, closeMoveModal, onMove } = useMove();
  const { topToastState, showTopToast } = useTopToast();

  const handleMove = async (destinationFolderId: string | null) => {
    if (onMove && item) {
      const destinationName = destinationFolderId === null
        ? 'Root'
        : folders.find(f => f.id === destinationFolderId)?.name ?? 'Root';
      try {
        // Awaited so the "moved" toast only fires once the store's async
        // persistence (commitVaultState -> AsyncStorage) has actually
        // resolved, instead of declaring success the instant the call was
        // fired off.
        await onMove(destinationFolderId);
        showTopToast(`${item.name} has been moved to ${destinationName}`);
      } catch (e) {
        console.error('Move failed', e);
        showTopToast(`Failed to move ${item.name}. Please try again.`, 'error');
      }
    }
    closeMoveModal();
  };

  return (
    <>
      <MoveVaultModal
        visible={visible}
        onClose={closeMoveModal}
        item={item}
        folders={folders}
        onMove={handleMove}
      />
      <TopToast state={topToastState} />
    </>
  );
}
