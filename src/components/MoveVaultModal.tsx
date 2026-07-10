import { ArrowLeft, ChevronRight, Folder, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export interface MoveVaultModalProps {
  visible: boolean;
  onClose: () => void;
  item: {
    id: string;
    name: string;
    type: 'file' | 'folder';
  } | null;
  folders: Array<{
    id: string;
    name: string;
    parentId?: string;
  }>;
  currentFolderId?: string;
  onMove: (destinationFolderId: string | null) => void;
}

export function MoveVaultModal({ visible, onClose, item, folders, currentFolderId, onMove }: MoveVaultModalProps) {
  const { colors, space, font, isTablet } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Filter out the item being moved if it's a folder
  const availableFolders = useMemo(() => {
    if (!item) return [];
    return folders.filter(f => {
      if (f.id === item.id && item.type === 'folder') return false;
      return true;
    });
  }, [folders, item]);

  // Search functionality
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return availableFolders;
    const query = searchQuery.toLowerCase().trim();
    return availableFolders.filter(f => f.name.toLowerCase().includes(query));
  }, [availableFolders, searchQuery]);

  // Group folders by parent for navigation
  const rootFolders = useMemo(() => {
    return filteredFolders.filter(f => !f.parentId);
  }, [filteredFolders]);

  const getSubfolders = (parentId: string) => {
    return filteredFolders.filter(f => f.parentId === parentId);
  };

  const handleMove = (folderId: string | null) => {
    if (item) {
      onMove(folderId);
      resetState();
    }
  };

  const resetState = () => {
    setSearchQuery('');
    setSelectedFolderId(null);
    onClose();
  };

  const handleCancel = () => {
    resetState();
  };

  const handleFolderPress = (folderId: string) => {
    setSelectedFolderId(folderId);
    // Auto-move when folder is selected
    handleMove(folderId);
  };

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.dashboardSurface ?? colors.surface }]}>
          {/* Header with close button */}
          <View style={styles.header}>
            <View style={styles.headerTitleArea}>
              <Text style={[styles.title, { color: colors.dashboardText ?? colors.text }]} numberOfLines={1}>
                Move {item.type === 'folder' ? 'Vault' : 'File'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.closeButton, { backgroundColor: colors.dashboardBg ?? colors.background }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.dashboardText ?? colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Item info */}
          <View style={[styles.itemInfo, { backgroundColor: colors.dashboardBg ?? colors.background }]}>
            <Text style={[styles.itemInfoLabel, { color: colors.dashboardTextMuted ?? colors.textMuted }]}>
              Moving:
            </Text>
            <Text style={[styles.itemInfoName, { color: colors.dashboardText ?? colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
          </View>

          {/* Search bar */}
          <View style={[styles.searchContainer, { backgroundColor: colors.dashboardBg ?? colors.background }]}>
            <Search size={16} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
            <TextInput
              style={[styles.searchInput, { color: colors.dashboardText ?? colors.text }]}
              placeholder="Search folders..."
              placeholderTextColor={colors.dashboardTextMuted ?? colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>

          {/* Root level option */}
          <TouchableOpacity
            style={[
              styles.folderItem,
              styles.rootOption,
              { 
                borderBottomColor: colors.dashboardBorder ?? colors.border,
                backgroundColor: selectedFolderId === null ? `${colors.dashboardAccent ?? colors.accent}15` : 'transparent'
              }
            ]}
            onPress={() => handleMove(null)}
            activeOpacity={0.7}
          >
            <View style={[styles.folderIcon, { backgroundColor: `${colors.dashboardAccent ?? colors.accent}18` }]}>
              <Folder size={20} color={colors.dashboardAccent ?? colors.accent} strokeWidth={1.8} />
            </View>
            <Text style={[styles.folderName, { color: colors.dashboardText ?? colors.text }]}>
              Root (Move to top level)
            </Text>
          </TouchableOpacity>

          {/* Folder list */}
          <ScrollView style={styles.folderList} showsVerticalScrollIndicator={false}>
            {filteredFolders.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.dashboardBg ?? colors.background }]}>
                <Folder size={32} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={1.5} />
                <Text style={[styles.emptyStateText, { color: colors.dashboardTextMuted ?? colors.textMuted }]}>
                  {searchQuery ? 'No folders match your search' : 'No folders available'}
                </Text>
              </View>
            ) : (
              filteredFolders.map((folder) => {
                const hasSubfolders = filteredFolders.some(f => f.parentId === folder.id);
                const isSelected = selectedFolderId === folder.id;
                
                return (
                  <View key={folder.id}>
                    <TouchableOpacity
                      style={[
                        styles.folderItem,
                        { 
                          borderBottomColor: colors.dashboardBorder ?? colors.border,
                          backgroundColor: isSelected ? `${colors.dashboardAccent ?? colors.accent}15` : 'transparent'
                        }
                      ]}
                      onPress={() => handleFolderPress(folder.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.folderIcon, { backgroundColor: `${colors.dashboardAccent ?? colors.accent}18` }]}>
                        <Folder size={20} color={colors.dashboardAccent ?? colors.accent} strokeWidth={1.8} />
                      </View>
                      <Text style={[styles.folderName, { color: colors.dashboardText ?? colors.text }]} numberOfLines={1}>
                        {folder.name}
                      </Text>
                      {hasSubfolders && (
                        <ChevronRight size={18} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                    
                    {/* Show subfolders inline if this folder is selected */}
                    {isSelected && hasSubfolders && (
                      <View style={styles.subfolderContainer}>
                        {getSubfolders(folder.id).map(subfolder => (
                          <TouchableOpacity
                            key={subfolder.id}
                            style={[
                              styles.subfolderItem,
                              { 
                                borderBottomColor: colors.dashboardBorder ?? colors.border,
                                backgroundColor: selectedFolderId === subfolder.id ? `${colors.dashboardAccent ?? colors.accent}15` : 'transparent'
                              }
                            ]}
                            onPress={() => handleFolderPress(subfolder.id)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.folderIcon, { backgroundColor: `${colors.dashboardAccent ?? colors.accent}18` }]}>
                              <Folder size={18} color={colors.dashboardAccent ?? colors.accent} strokeWidth={1.8} />
                            </View>
                            <Text style={[styles.folderName, { color: colors.dashboardText ?? colors.text, fontSize: 14 }]} numberOfLines={1}>
                              {subfolder.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleArea: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  itemInfoLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  itemInfoName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 2,
  },
  rootOption: {
    marginBottom: 8,
  },
  folderList: {
    maxHeight: 280,
    marginBottom: 16,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  subfolderContainer: {
    marginLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,0,0,0.1)',
  },
  subfolderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 12,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '500',
  },
});