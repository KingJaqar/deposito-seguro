import { useMove } from '../contexts/MoveVaultContext';
import { MoveVaultModal } from './MoveVaultModal';

export function MoveVaultModalWrapper() {
  const { visible, item, folders, currentFolderId, closeMoveModal, onMove } = useMove();

  const handleMove = (destinationFolderId: string | null) => {
    if (onMove) {
      onMove(destinationFolderId);
    }
    closeMoveModal();
  };

  return (
    <MoveVaultModal
      visible={visible}
      onClose={closeMoveModal}
      item={item}
      folders={folders}
      currentFolderId={currentFolderId}
      onMove={handleMove}
    />
  );
}