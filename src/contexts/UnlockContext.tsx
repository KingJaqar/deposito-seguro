import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

/**
 * Session-based unlock state for encrypted items.
 * Tracks which items have been unlocked during the current app session.
 * This state is NOT persisted to storage and clears on app restart.
 */
interface UnlockState {
  /** Set of item IDs (file or folder) that have been unlocked in this session */
  unlockedItems: Set<string>;
  /**
   * Mark an item as unlocked for this session.
   * After unlocking, the user won't be prompted again until app restart.
   */
  markUnlocked: (itemId: string) => void;
  /** Check if an item has been unlocked in this session */
  isUnlocked: (itemId: string) => boolean;
  /** Clear all unlock state (called on logout/session end) */
  clearAll: () => void;
}

const UnlockContext = createContext<UnlockState | null>(null);

export function UnlockProvider({ children }: { children: ReactNode }) {
  const [unlockedItems, setUnlockedItems] = useState<Set<string>>(new Set());

  const markUnlocked = useCallback((itemId: string) => {
    setUnlockedItems(prev => new Set([...prev, itemId]));
  }, []);

  const isUnlocked = useCallback((itemId: string): boolean => {
    return unlockedItems.has(itemId);
  }, [unlockedItems]);

  const clearAll = useCallback(() => {
    setUnlockedItems(new Set());
  }, []);

  return (
    <UnlockContext.Provider value={{ unlockedItems, markUnlocked, isUnlocked, clearAll }}>
      {children}
    </UnlockContext.Provider>
  );
}

export function useUnlockState() {
  const context = useContext(UnlockContext);
  if (!context) {
    throw new Error('useUnlockState must be used within an UnlockProvider');
  }
  return context;
}