// src/app/(main)/folder/[id].tsx
// Thin wrapper route per plans/album implementation plan.md §2, Phase 2 —
// the actual screen body now lives in VaultContentsScreen, shared with the
// album route (src/app/(main)/album/[id].tsx).
import { useLocalSearchParams } from 'expo-router';
import { VaultContentsScreen } from '../../../components/vault/VaultContentsScreen';

export default function FolderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <VaultContentsScreen variant="folder" containerId={id} />;
}
