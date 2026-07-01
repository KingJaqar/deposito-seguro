// File: src/app/(main)/settings/index.tsx
import { router } from 'expo-router';
import { Calculator, Circle, Key, Lock, Moon, Palette, Pencil, Search, Sun } from 'lucide-react-native';
import { ReactNode, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccessKeyScreenAuthModal } from '../../../components/AccessKeyScreenAuthModal';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { BackupService } from '../../../services/backup';
import { useSettingsStore } from '../../../store/settingsStore';
import { setDisguiseIcon } from '../../../utils/disguiseIcon';

interface SettingItem {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  type: 'toggle' | 'link';
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
}

export default function SettingsCenterScreen() {
  const { colors, isDark, toggleTheme, space, screenPadding, bottomTabSpacing, headerPaddingTop, font, isTablet, clampSize } = useTheme();
  const { themeMode, disguiseMode, updateSetting } = useSettingsStore();
  const { width } = useWindowDimensions();

  const iconSize = clampSize(40, 56);
  const iconOptionSize = clampSize(64, 88);
  const iconOptionImageSize = clampSize(32, 48);

  const dash = {
    bg: colors.dashboardBg ?? colors.background,
    surface: colors.dashboardSurface ?? colors.surface,
    surfaceHover: colors.dashboardSurfaceHover ?? colors.surfaceElevated,
    accent: colors.dashboardAccent ?? colors.accent,
    text: colors.dashboardText ?? colors.text,
    textMuted: colors.dashboardTextMuted ?? colors.textMuted,
    border: colors.dashboardBorder ?? colors.border,
    fabBg: colors.fabBg ?? colors.primary,
    fabText: colors.fabText ?? '#FFFFFF',
  };

  const [query, setQuery] = useState('');
  const [showAccessKeyAuthModal, setShowAccessKeyAuthModal] = useState(false);
  const [showDisplayNameModal, setShowDisplayNameModal] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [disguiseIconTheme, setDisguiseIconTheme] = useState(useSettingsStore.getState().disguiseIconTheme);

  const handleAccessKeysPress = () => {
    setShowAccessKeyAuthModal(true);
  };

  const handleAccessKeyAuthSuccess = () => {
    setShowAccessKeyAuthModal(false);
    router.push('/(main)/settings/access-keys');
  };

  const [backupProgress, setBackupProgress] = useState<{ message: string; progress: number } | null>(null);

  const handleExport = async () => {
    setBackupProgress({ message: 'Starting backup...', progress: 0 });
    
    const result = await BackupService.createBackup((message, progress) => {
      setBackupProgress({ message, progress });
    });

    setBackupProgress(null);

    if (result.success) {
      Alert.alert(
        'Backup Complete',
        `Backup saved as ${result.backupName}\nSize: ${(result.fileSize || 0 / 1024).toFixed(2)} KB`,
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Backup Error', result.error || 'Failed to create backup.');
    }
  };

  const handleImport = async () => {
    const result = await BackupService.importBackup((message, progress) => {
      setBackupProgress({ message, progress });
    });

    setBackupProgress(null);

    if (result.success) {
      Alert.alert(
        'Restore Complete',
        `Restored ${result.restoredFiles} files and ${result.restoredFolders} folders.`,
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Restore Error', result.error || 'Failed to restore backup.');
    }
  };

  const settingSections = [
    {
      title: 'Identity Disguise Shield',
      items: [
        {
          id: 'calculator',
          title: 'Calculator Spoofing',
          description: 'Disguise app as calculator',
          icon: <Calculator size={22} strokeWidth={2} color={dash.accent} />,
          type: 'toggle' as const,
          value: disguiseMode === 'calculator',
          onValueChange: (val: boolean) => {
            updateSetting('disguiseMode', val ? 'calculator' : 'default');
            if (val) {
              const currentName = useSettingsStore.getState().disguiseAppName;
              if (!currentName || currentName === 'Deposito Seguro') {
                updateSetting('disguiseAppName', 'Calculator');
              }
            }
          },
        },
        disguiseMode === 'calculator' && {
          id: 'calculator-app-name',
          title: 'Display Name',
          description: 'App name shown on home screen',
          icon: <Pencil size={22} strokeWidth={2} color={dash.accent} />,
          type: 'link' as const,
          onPress: () => {
            setDisplayNameInput(useSettingsStore.getState().disguiseAppName || '');
            setShowDisplayNameModal(true);
          },
        } as SettingItem,
      ].filter(Boolean) as SettingItem[],
    },
    {
      title: 'Visual Configurations',
      items: [
        {
          id: 'theme',
          title: isDark ? 'Dark Mode' : 'Light Mode',
          description: isDark ? 'AMOLED black theme' : 'Light cream theme',
          icon: isDark ? <Moon size={22} strokeWidth={2} color={dash.accent} /> : <Sun size={22} strokeWidth={2} color={dash.accent} />,
          type: 'toggle' as const,
          value: isDark,
          onValueChange: () => toggleTheme(),
        },
        {
          id: 'amoled',
          title: 'High Contrast AMOLED',
          description: 'Pure black for OLED displays',
          icon: <Circle size={22} strokeWidth={2} fill={dash.accent} color={dash.accent} />,
          type: 'toggle' as const,
          value: themeMode === 'amoled',
          onValueChange: (val: boolean) => updateSetting('themeMode', val ? 'amoled' : 'dark'),
        },
      ] as SettingItem[],
    },
    {
      title: 'Access Key Control',
      items: [
        {
          id: 'passwords',
          title: 'Access Keys',
          description: 'Create, view, and manage access keys',
          icon: <Lock size={22} strokeWidth={2} color={dash.accent} />,
          type: 'link' as const,
          onPress: handleAccessKeysPress,
        },
      ] as SettingItem[],
    },
    {
      title: 'Vault Authentication',
      items: [
        {
          id: 'auth-key',
          title: 'Authentication Key',
          description: 'Manage your vault authentication key',
          icon: <Key size={22} strokeWidth={2} color={dash.accent} />,
          type: 'link' as const,
          onPress: () => router.push('/(main)/settings/auth-key'),
        },
      ] as SettingItem[],
    },
  ];

  const SettingCard = ({ item }: { item: SettingItem }) => {
    const [isEnabled, setIsEnabled] = useState(item.value ?? false);

    const handleToggle = () => {
      const newValue = !isEnabled;
      setIsEnabled(newValue);
      item.onValueChange?.(newValue);
    };

    return (
      <TouchableOpacity
        onPress={item.type === 'link' ? item.onPress : undefined}
        activeOpacity={item.type === 'link' ? 0.7 : 1}
        style={[
          styles.settingCard,
          {
            backgroundColor: dash.surface,
            padding: space(4),
          },
        ]}
      >
        <View style={styles.settingContent}>
          <View style={[styles.settingIcon, { backgroundColor: `${dash.accent}15`, width: iconSize, height: iconSize, borderRadius: iconSize / 2, marginRight: space(3) }]}>
            {item.icon}
          </View>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingTitle, { color: dash.text, fontSize: font(15) }]}>{item.title}</Text>
            {item.description && (
              <Text style={[styles.settingDescription, { color: dash.textMuted, fontSize: font(12) }]}>{item.description}</Text>
            )}
          </View>
          {item.type === 'toggle' && (
            <Switch
              value={isEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: dash.border, true: dash.accent }}
              thumbColor={isEnabled ? dash.fabText : dash.textMuted}
            />
          )}
          {item.type === 'link' && (
            <Text style={[styles.chevron, { color: dash.accent, fontSize: font(28) }]}>›</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const q = query.trim().toLowerCase();

  const visibleSections = settingSections
    .map(section => {
      const filteredItems = section.items.filter(item =>
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
      return { ...section, items: filteredItems };
    })
    .filter(section => {
      if (section.items.length > 0) return true;
      if (!q && section.title === 'Identity Disguise Shield' && disguiseMode === 'calculator') return true;
      return false;
    });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text, fontSize: font(24) }]} numberOfLines={1}>Settings</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted, fontSize: font(13) }]} numberOfLines={1}>Manage your preferences</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchBar, { backgroundColor: dash.surface, paddingHorizontal: space(4), paddingVertical: space(3) }]}>
          <Search size={18} color={dash.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: dash.text, fontSize: font(14) }]}
            placeholder="Search settings..."
            placeholderTextColor={dash.textMuted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {visibleSections.length === 0 && q ? (
          <View style={styles.emptyState}>
            <Search size={32} color={dash.textMuted} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.4 }} />
            <Text style={[styles.emptyTitle, { color: dash.text, fontSize: font(17) }]}>No results found</Text>
            <Text style={[styles.emptyText, { color: dash.textMuted, fontSize: font(13) }]}>Try a different search term</Text>
          </View>
        ) : (
          visibleSections.map((section, sectionIndex) => (
            <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: dash.text, fontSize: font(13) }]}>{section.title}</Text>
            <View style={[styles.cardsContainer, { gap: space(3) }]}>
              {section.items.map((item) => (
                <SettingCard key={item.id} item={item} />
              ))}
              {section.title === 'Identity Disguise Shield' && disguiseMode === 'calculator' && (
                <View style={[styles.iconPickerCard, { backgroundColor: dash.surface, borderColor: dash.border, padding: space(4) }]}>
                  <View style={styles.settingContent}>
                    <View style={[styles.settingIcon, { backgroundColor: `${dash.accent}15`, width: iconSize, height: iconSize, borderRadius: iconSize / 2, marginRight: space(3) }]}>
                      <Palette size={22} strokeWidth={2} color={dash.accent} />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={[styles.settingTitle, { color: dash.text, fontSize: font(15) }]}>Icon Theme</Text>
                      <Text style={[styles.settingDescription, { color: dash.textMuted, fontSize: font(12) }]}>Home screen icon color</Text>
                    </View>
                  </View>
                  <View style={[styles.iconGrid, { gap: space(2) }]}>
                    {[
                      { id: 'default', label: 'Default', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-white.png') },
                      { id: 'white', label: 'White', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-white.png') },
                      { id: 'orange', label: 'Orange', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-orange.png') },
                      { id: 'red', label: 'Red', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-red.png') },
                    ].map((theme) => (
                      <TouchableOpacity
                        key={theme.id}
                        style={[
                          styles.iconOption,
                          { backgroundColor: dash.surfaceHover, borderColor: disguiseIconTheme === theme.id ? dash.accent : dash.border, width: iconOptionSize, height: iconOptionSize, borderRadius: iconOptionSize / 4 },
                          disguiseIconTheme === theme.id && styles.iconOptionSelected,
                        ]}
                        onPress={async () => {
                          setDisguiseIconTheme(theme.id as any);
                          updateSetting('disguiseIconTheme', theme.id as any);
                          await setDisguiseIcon(theme.id);
                        }}
                        activeOpacity={0.7}
                      >
                        <Image
                          source={theme.source}
                          style={[styles.iconOptionImage, { width: iconOptionImageSize, height: iconOptionImageSize, borderRadius: iconOptionImageSize / 4 }]}
                          resizeMode="contain"
                        />
                        <Text style={[styles.iconOptionText, { color: dash.textMuted, fontSize: font(10) }]}>{theme.label}</Text>
                       </TouchableOpacity>
                     ))}
                   </View>
                 </View>
              )}
            </View>
          </View>
        )))}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: dash.text, fontSize: font(13) }]}>Data Continuity Engine</Text>
          <View style={[styles.cardsContainer, { gap: space(3) }]}>
            <TouchableOpacity
              onPress={handleExport}
              style={[
                styles.settingCard,
                {
                  backgroundColor: dash.surface,
                  padding: space(4),
                },
              ]}
            >
              <View style={styles.settingContent}>
                <View style={[styles.settingIcon, { backgroundColor: `${dash.accent}15`, width: iconSize, height: iconSize, borderRadius: iconSize / 2, marginRight: space(3) }]}>
                  <Text style={{ fontSize: 22 }}>📦</Text>
                </View>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: dash.text, fontSize: font(15) }]}>Create Backup</Text>
                  <Text style={[styles.settingDescription, { color: dash.textMuted, fontSize: font(12) }]}>Export vault to secure archive</Text>
                </View>
                <Text style={[styles.chevron, { color: dash.accent, fontSize: font(28) }]}>›</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleImport}
              style={[
                styles.settingCard,
                {
                  backgroundColor: dash.surface,
                  padding: space(4),
                },
              ]}
            >
              <View style={styles.settingContent}>
                <View style={[styles.settingIcon, { backgroundColor: `${dash.accent}15`, width: iconSize, height: iconSize, borderRadius: iconSize / 2, marginRight: space(3) }]}>
                  <Text style={{ fontSize: 22 }}>📥</Text>
                </View>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: dash.text, fontSize: font(15) }]}>Restore Backup</Text>
                  <Text style={[styles.settingDescription, { color: dash.textMuted, fontSize: font(12) }]}>Import vault from archive</Text>
                </View>
                <Text style={[styles.chevron, { color: dash.accent, fontSize: font(28) }]}>›</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: bottomTabSpacing }} />
      </ScrollView>

      <AnimatedTabBar />
      <AccessKeyScreenAuthModal
        visible={showAccessKeyAuthModal}
        onClose={() => setShowAccessKeyAuthModal(false)}
        onSuccess={handleAccessKeyAuthSuccess}
      />

      {/* Backup Progress Modal */}
      <Modal visible={backupProgress !== null} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={[styles.modalOverlay, { padding: space(6) }]}>
          <View style={[styles.modalCard, { backgroundColor: dash.surface, padding: space(6), alignItems: 'center' }]}>
            <Text style={[styles.modalTitle, { color: dash.text, fontSize: font(18) }]}>
              {backupProgress?.progress === 100 ? 'Complete!' : 'Processing...'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: dash.textMuted, fontSize: font(14), marginBottom: space(5), textAlign: 'center' }]}>
              {backupProgress?.message || 'Please wait...'}
            </Text>
            
            {/* Progress Bar */}
            <View style={[styles.progressBarTrack, { backgroundColor: dash.border, height: 8, borderRadius: 4, width: '100%', overflow: 'hidden' }]}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    backgroundColor: dash.accent, 
                    height: '100%', 
                    width: `${backupProgress?.progress || 0}%`,
                    borderRadius: 4,
                  }
                ]} 
              />
            </View>
            
            <Text style={[styles.progressText, { color: dash.textMuted, fontSize: font(12), marginTop: space(3) }]}>
              {Math.round(backupProgress?.progress || 0)}%
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showDisplayNameModal} transparent animationType="fade" onRequestClose={() => setShowDisplayNameModal(false)}>
        <View style={[styles.modalOverlay, { padding: space(6) }]}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowDisplayNameModal(false)} activeOpacity={1} />
          <View style={[styles.modalCard, { backgroundColor: dash.surface, padding: space(6) }]}>
            <Text style={[styles.modalTitle, { color: dash.text, fontSize: font(20) }]}>App Display Name</Text>
            <Text style={[styles.modalSubtitle, { color: dash.textMuted, fontSize: font(14), marginBottom: space(5), lineHeight: font(14) * 1.4 }]}>
              Enter the name to show on the home screen (leave empty to use default)
            </Text>
            <TextInput
              style={[styles.modalInput, { color: dash.text, borderColor: dash.border, backgroundColor: dash.bg, paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), marginBottom: space(5) }]}
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Deposito Seguro"
              placeholderTextColor={dash.textMuted}
              autoFocus
            />
            <View style={[styles.modalButtonRow, { gap: space(3) }]}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: dash.surfaceHover, paddingVertical: space(3) }]}
                onPress={() => setShowDisplayNameModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: dash.text, fontSize: font(15) }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary, paddingVertical: space(3) }]}
                onPress={() => {
                  updateSetting('disguiseAppName', displayNameInput.trim());
                  setShowDisplayNameModal(false);
                }}
              >
                <Text style={[styles.modalSaveText, { fontSize: font(15) }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 16,
  },
  headerTextBlock: { flex: 1, marginRight: 12 },
  headerTitle: { fontWeight: '800', letterSpacing: -0.4 },
  headerTagline: { fontWeight: '500', marginTop: 4 },

  scrollBody: { paddingHorizontal: 24, paddingTop: 4 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontWeight: '500' },

  section: { marginBottom: 28 },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    opacity: 0.7,
  },

  cardsContainer: {},

  settingCard: {
    borderRadius: 20,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: { flex: 1 },
  settingTitle: {
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
    flexShrink: 1,
  },
  settingDescription: {
    fontWeight: '500',
  },
  chevron: {
    fontWeight: '300',
    marginLeft: 4,
    flexShrink: 0,
  },

  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  emptyText: {
    textAlign: 'center',
  },
  exportButton: {
    borderRadius: 16,
    alignItems: 'center',
  },
  exportButtonText: {
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  modalSubtitle: {
    textAlign: 'center',
    lineHeight: 20,
  },
  modalInput: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
  },
  modalButtonRow: {
    flexDirection: 'row',
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1.2,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  iconPickerCard: {
    borderRadius: 20,
    borderWidth: 1,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  iconOption: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  iconOptionSelected: {
    borderWidth: 2,
  },
  iconOptionImage: {
    borderRadius: 10,
  },
  iconOptionText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressBarTrack: {},
  progressBarFill: {},
  progressText: {
    fontWeight: '600',
  },
});
