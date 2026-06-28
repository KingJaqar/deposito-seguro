// File: src/app/(main)/settings/index.tsx
import { router } from 'expo-router';
import { Moon, Search, Sun, Calculator, Pencil, Circle, Lock, Key, Palette } from 'lucide-react-native';
import { ReactNode, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { AccessKeyScreenAuthModal } from '../../../components/AccessKeyScreenAuthModal';
import { setDisguiseIcon } from '../../../utils/disguiseIcon';
import { useTheme } from '../../../contexts/ThemeContext';
import { BackupService } from '../../../services/backup';
import { useSettingsStore } from '../../../store/settingsStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = SCREEN_WIDTH - SCREEN_PADDING * 2;

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
  const { colors, isDark, toggleTheme } = useTheme();
  const { themeMode, disguiseMode, updateSetting } = useSettingsStore();

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

  const handleExport = async () => {
    const path = await BackupService.exportCompleteBackupArchive();
    if (path) {
      Alert.alert('Backup Complete', 'Encrypted local structural manifest shared successfully.');
    } else {
      Alert.alert('Backup Error', 'Failed compiling data structures.');
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
          },
        ]}
      >
        <View style={styles.settingContent}>
          <View style={[styles.settingIcon, { backgroundColor: `${dash.accent}15` }]}>
            {item.icon}
          </View>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingTitle, { color: dash.text }]}>{item.title}</Text>
            {item.description && (
              <Text style={[styles.settingDescription, { color: dash.textMuted }]}>{item.description}</Text>
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
            <Text style={[styles.chevron, { color: dash.accent }]}>›</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>Settings</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Manage your preferences</Text>
        </View>
        <Pressable
          onPress={toggleTheme}
          style={[styles.themeToggle, { backgroundColor: dash.surfaceHover }]}
          accessibilityRole="button"
          accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={18} color={dash.text} /> : <Moon size={18} color={dash.text} />}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchBar, { backgroundColor: dash.surface }]}>
          <Search size={18} color={dash.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: dash.text }]}
            placeholder="Search settings..."
            placeholderTextColor={dash.textMuted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {settingSections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: dash.text }]}>{section.title}</Text>
            <View style={styles.cardsContainer}>
              {section.items.map((item) => (
                <SettingCard key={item.id} item={item} />
              ))}
              {section.title === 'Identity Disguise Shield' && disguiseMode === 'calculator' && (
                <View style={[styles.iconPickerCard, { backgroundColor: dash.surface, borderColor: dash.border }]}>
                  <View style={styles.settingContent}>
                    <View style={[styles.settingIcon, { backgroundColor: `${dash.accent}15` }]}>
                      <Palette size={22} strokeWidth={2} color={dash.accent} />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={[styles.settingTitle, { color: dash.text }]}>Icon Theme</Text>
                      <Text style={[styles.settingDescription, { color: dash.textMuted }]}>Home screen icon color</Text>
                    </View>
                  </View>
                  <View style={styles.iconGrid}>
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
                          { backgroundColor: dash.surfaceHover, borderColor: disguiseIconTheme === theme.id ? dash.accent : dash.border },
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
                          style={styles.iconOptionImage}
                          resizeMode="contain"
                        />
                        <Text style={[styles.iconOptionText, { color: dash.textMuted }]}>{theme.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: dash.text }]}>Data Continuity Engine</Text>
          <TouchableOpacity
            onPress={handleExport}
            style={[
              styles.exportButton,
              {
                backgroundColor: dash.fabBg,
              },
            ]}
          >
            <Text style={[styles.exportButtonText, { color: dash.fabText }]}>
              Export Standalone Backup Archive
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <AnimatedTabBar />
      <AccessKeyScreenAuthModal
        visible={showAccessKeyAuthModal}
        onClose={() => setShowAccessKeyAuthModal(false)}
        onSuccess={handleAccessKeyAuthSuccess}
      />

      <Modal visible={showDisplayNameModal} transparent animationType="fade" onRequestClose={() => setShowDisplayNameModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowDisplayNameModal(false)} activeOpacity={1} />
          <View style={[styles.modalCard, { backgroundColor: dash.surface }]}>
            <Text style={[styles.modalTitle, { color: dash.text }]}>App Display Name</Text>
            <Text style={[styles.modalSubtitle, { color: dash.textMuted }]}>
              Enter the name to show on the home screen (leave empty to use default)
            </Text>
            <TextInput
              style={[styles.modalInput, { color: dash.text, borderColor: dash.border, backgroundColor: dash.bg }]}
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Deposito Seguro"
              placeholderTextColor={dash.textMuted}
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: dash.surfaceHover }]}
                onPress={() => setShowDisplayNameModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: dash.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  updateSetting('disguiseAppName', displayNameInput.trim());
                  setShowDisplayNameModal(false);
                }}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 50,
    paddingBottom: 16,
  },
  headerTextBlock: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  headerTagline: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollBody: { paddingHorizontal: SCREEN_PADDING, paddingTop: 8 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    opacity: 0.7,
  },

  cardsContainer: { gap: CARD_GAP },

  settingCard: {
    borderRadius: 20,
    padding: 16,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingInfo: { flex: 1 },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 28,
    fontWeight: '300',
    marginLeft: 8,
  },

  exportButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 24,
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
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInput: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 20,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontWeight: '700',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  iconPickerCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  iconOption: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    gap: 4,
  },
  iconOptionSelected: {
    borderWidth: 2,
  },
  iconOptionImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  iconOptionText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});