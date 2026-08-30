// src/app/(main)/album/[id].tsx
// Thin wrapper route per plans/album implementation plan.md §2/§5, Phase 3 —
// identical shape to src/app/(main)/folder/[id].tsx, just variant="album".
// All album-specific behavior (media-only import, date-grouped grid,
// no-subfolder UI) lives in the shared VaultContentsScreen component.
import { useLocalSearchParams } from 'expo-router';
import { VaultContentsScreen } from '../../../components/vault/VaultContentsScreen';

export default function AlbumDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <VaultContentsScreen variant="album" containerId={id} />;
}
