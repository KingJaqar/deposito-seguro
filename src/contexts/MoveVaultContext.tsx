import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

export interface MoveItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  folderId?: string; // For files, the folder they belong to
  /**
   * 'move' (default, when omitted) is the original relocate-in-place
   * semantics. 'add-to-album' (plan §7, Phase 6) reuses this exact same
   * "pick a destination folder" modal for the "Add to Album…" quick action
   * — which *copies* the file instead of moving it — so MoveVaultModal and
   * MoveVaultModalWrapper both need to know which one they're presenting:
   * hardcoded "Move"/"Moved to X" copy would be actively wrong (the file
   * wasn't moved, and the original wasn't touched) for the add-to-album
   * case, not just cosmetically off.
   */
  mode?: 'move' | 'add-to-album';
}

export interface MoveDestination {
  id: string;
  name: string;
  parentId?: string;
  isFavorite: boolean;
  hasAccessKey: boolean;
  fileCount: number;
  totalSize: number;
}

type MoveCallback = (destinationFolderId: string | null) => void | Promise<void>;

interface MoveVaultContextType {
  visible: boolean;
  item: MoveItem | null;
  folders: MoveDestination[];
  openMoveModal: (moveItem: MoveItem, availableFolders: MoveDestination[]) => void;
  closeMoveModal: () => void;
  onMove: MoveCallback | null;
  setOnMove: (callback: MoveCallback | null) => void;
}

const MoveVaultContext = createContext<MoveVaultContextType | undefined>(undefined);

export function MoveProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<MoveItem | null>(null);
  const [folders, setFolders] = useState<MoveDestination[]>([]);
  const [onMoveCallback, setOnMoveCallback] = useState<MoveCallback | null>(null);

  const openMoveModal = useCallback((
    moveItem: MoveItem,
    availableFolders: MoveDestination[]
  ) => {
    setItem(moveItem);
    setFolders(availableFolders);
    setVisible(true);
  }, []);

  const closeMoveModal = useCallback(() => {
    setVisible(false);
    setItem(null);
    setFolders([]);
    setOnMoveCallback(null);
  }, []);

  const setOnMove = useCallback((callback: MoveCallback | null) => {
    setOnMoveCallback(() => callback);
  }, []);

  const value: MoveVaultContextType = {
    visible,
    item,
    folders,
    openMoveModal,
    closeMoveModal,
    onMove: onMoveCallback,
    setOnMove,
  };

  return (
    <MoveVaultContext.Provider value={value}>
      {children}
    </MoveVaultContext.Provider>
  );
}

export function useMove() {
  const context = useContext(MoveVaultContext);
  if (context === undefined) {
    throw new Error('useMove must be used within a MoveProvider');
  }
  return context;
}