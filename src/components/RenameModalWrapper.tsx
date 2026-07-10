import { useRename } from '../contexts/RenameContext';
import { RenameModal } from './RenameModal';

export function RenameModalWrapper() {
  const { visible, item, closeRenameModal, onRename } = useRename();

  const handleRename = (newName: string) => {
    if (onRename) {
      onRename(newName);
    }
    closeRenameModal();
  };

  return (
    <RenameModal
      visible={visible}
      onClose={closeRenameModal}
      item={item}
      onRename={handleRename}
    />
  );
}