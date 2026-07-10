import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

export interface RenameItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  folderId?: string; // For files, the folder they belong to
}

interface RenameContextType {
  visible: boolean;
  item: RenameItem | null;
  openRenameModal: (item: RenameItem) => void;
  closeRenameModal: () => void;
  onRename: ((newName: string) => void) | null;
  setOnRename: (callback: ((newName: string) => void) | null) => void;
}

const RenameContext = createContext<RenameContextType | undefined>(undefined);

export function RenameProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<RenameItem | null>(null);
  const [onRenameCallback, setOnRenameCallback] = useState<((newName: string) => void) | null>(null);

  const openRenameModal = useCallback((renameItem: RenameItem) => {
    setItem(renameItem);
    setVisible(true);
  }, []);

  const closeRenameModal = useCallback(() => {
    setVisible(false);
    setItem(null);
    setOnRenameCallback(null);
  }, []);

  const setOnRename = useCallback((callback: ((newName: string) => void) | null) => {
    setOnRenameCallback(() => callback);
  }, []);

  const value: RenameContextType = {
    visible,
    item,
    openRenameModal,
    closeRenameModal,
    onRename: onRenameCallback,
    setOnRename,
  };

  return (
    <RenameContext.Provider value={value}>
      {children}
    </RenameContext.Provider>
  );
}

export function useRename() {
  const context = useContext(RenameContext);
  if (context === undefined) {
    throw new Error('useRename must be used within a RenameProvider');
  }
  return context;
}