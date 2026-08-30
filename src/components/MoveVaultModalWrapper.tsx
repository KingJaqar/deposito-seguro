import { Alert } from 'react-native';
import { useMove } from '../contexts/MoveVaultContext';
import { AlbumMediaOnlyError, StorageLimitExceededError } from '../store/vaultStore';
import { formatBytes } from '../constants/storageLimits';
import { MoveVaultModal } from './MoveVaultModal';
import { TopToast, useTopToast } from './primitives/TopToast';

export function MoveVaultModalWrapper() {
  const { visible, item, folders, closeMoveModal, onMove } = useMove();
  const { topToastState, showTopToast } = useTopToast();

  const handleMove = async (destinationFolderId: string | null) => {
    if (onMove && item) {
      const isAddToAlbum = item.mode === 'add-to-album';
      const destinationName = destinationFolderId === null
        ? 'Root'
        : folders.find(f => f.id === destinationFolderId)?.name ?? 'Root';
      try {
        // Awaited so the "moved"/"added" toast only fires once the store's
        // async persistence (commitVaultState -> AsyncStorage) has actually
        // resolved, instead of declaring success the instant the call was
        // fired off.
        await onMove(destinationFolderId);
        showTopToast(isAddToAlbum
          ? `${item.name} has been added to ${destinationName}`
          : `${item.name} has been moved to ${destinationName}`);
      } catch (e) {
        // Add-to-album routes through vaultStore.addFileToAlbum ->
        // copyFileToFolder, which can throw either of these (plan §7:
        // "Also handle StorageLimitExceededError… show the same friendly
        // message the rest of the app already uses, not a generic failure
        // alert"). A plain "Move" never throws either — moveFolder/
        // moveFileToFolder just mutate in place — so these only trip on the
        // add-to-album path in practice, but the instanceof check is the
        // correct guard either way.
        if (e instanceof StorageLimitExceededError) {
          Alert.alert(
            'Storage Limit Reached',
            `This vault is capped at ${formatBytes(e.limitBytes)}. It's currently using ${formatBytes(e.usedBytes)}, and adding this needs ${formatBytes(e.incomingBytes)} more. Raise the limit in Settings → Storage, or free up space first.`
          );
        } else if (e instanceof AlbumMediaOnlyError) {
          Alert.alert("Can't Add This", e.message);
        } else {
          console.error('Move failed', e);
          showTopToast(
            isAddToAlbum ? `Failed to add ${item.name}. Please try again.` : `Failed to move ${item.name}. Please try again.`,
            'error'
          );
        }
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
