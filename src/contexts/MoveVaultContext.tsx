import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

export interface MoveItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  folderId?: string; // For files, the folder they belong to
}

export interface MoveDestination {
  id: string;
  name: string;
  parentId?: string;
}

interface MoveVaultContextType {
  visible: boolean;
  item: MoveItem | null;
  folders: MoveDestination[];
  currentFolderId?: string;
  openMoveModal: (moveItem: MoveItem, availableFolders: MoveDestination[], currentFolderId?: string) => void;
  closeMoveModal: () => void;
  onMove: ((destinationFolderId: string | null) => void) | null;
  setOnMove: (callback: ((destinationFolderId: string | null) => void) | null) => void;
}

const MoveVaultContext = createContext<MoveVaultContextType | undefined>(undefined);

export function MoveProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<MoveItem | null>(null);
  const [folders, setFolders] = useState<MoveDestination[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [onMoveCallback, setOnMoveCallback] = useState<((destinationFolderId: string | null) => void) | null>(null);

  const openMoveModal = useCallback((
    moveItem: MoveItem,
    availableFolders: MoveDestination[],
    currentFolderId?: string
  ) => {
    setItem(moveItem);
    setFolders(availableFolders);
    setCurrentFolderId(currentFolderId);
    setVisible(true);
  }, []);

  const closeMoveModal = useCallback(() => {
    setVisible(false);
    setItem(null);
    setFolders([]);
    setCurrentFolderId(undefined);
    setOnMoveCallback(null);
  }, []);

  const setOnMove = useCallback((callback: ((destinationFolderId: string | null) => void) | null) => {
    setOnMoveCallback(() => callback);
  }, []);

  const value: MoveVaultContextType = {
    visible,
    item,
    folders,
    currentFolderId,
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