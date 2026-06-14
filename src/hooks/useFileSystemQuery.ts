import { useMemo } from 'react';
import { useVaultStore } from '../store/vaultStore';

export const useFileSystemQuery = (folderId?: string, queryText?: string) => {
  const { files, folders } = useVaultStore();

  return useMemo(() => {
    let filteredFiles = files.filter(f => !f.isTrash);
    let filteredFolders = folders;

    if (folderId) {
      filteredFiles = filteredFiles.filter(f => f.folderId === folderId);
    }

    if (queryText && queryText.trim().length > 0) {
      const term = queryText.toLowerCase();
      filteredFiles = filteredFiles.filter(f => f.name.toLowerCase().includes(term));
      filteredFolders = filteredFolders.filter(f => f.name.toLowerCase().includes(term));
    }

    return {
      matchedFiles: filteredFiles,
      matchedFolders: folderId ? [] : filteredFolders
    };
  }, [files, folders, folderId, queryText]);
};