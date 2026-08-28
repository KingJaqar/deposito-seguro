// src/app/(main)/settings/index.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store hook and handler body (backup/restore flow incl. passphrase and
// fallback-key warnings, disguise/theme/screenshot-protection toggles, icon
// theme picker) is unchanged; only JSX/StyleSheet is new. Notable per-plan changes:
//  - TabRootHeader + SwitchRow/Card/Dialog/TextField primitives, replacing the
//    local `SettingCard` component and the four hand-rolled <Modal> blocks
//    (backup progress, backup result, restore passphrase, display name)
//  - the `dash` alias object and its colors.dashboardX/accent fallback chains are gone
//  - the one in-scope navigational fix (§2/§8): a "Customization" link card is
//    added to the Visual Configurations section, pointing at the existing,
//    previously-unreachable settings/customization screen
//  - backup progress/result and restore-passphrase/display-name prompts stay
//    Dialog (per §3's success-state rule — these carry real content or a
//    further choice, not a one-off Snackbar-eligible confirmation)
//  - the screen-enter fade goes through the shared useScreenEnterAnimation()
//    hook (§4) instead of a hand-rolled copy — see folder/[id].tsx
import { router } from 'expo-router';
import {
  Calculator,
  ChevronRight,
  Circle,
  Key,
  Lock,
  Moon,
  HardDrive,
  Package,
  Palette,
  PencilLine,
  Search,
  ShieldAlert,
  Sun,
  Upload,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { AccessKeyScreenAuthModal } from '../../../components/AccessKeyScreenAuthModal';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { BackupConfirmDialog } from '../../../components/BackupConfirmDialog';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { Card } from '../../../components/primitives/Card';
import { Dialog } from '../../../components/primitives/Dialog';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { ProgressBar } from '../../../components/primitives/ProgressBar';
import { SwitchRow } from '../../../components/primitives/SwitchRow';
import { TextField } from '../../../components/primitives/TextField';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import { useScreenEnterAnimation } from '../../../hooks/useScreenEnterAnimation';
import { MIN_TOUCH_TARGET } from '../../../utils/responsive';
import { BackupService, BackupEstimate, BackupFolderHandle } from '../../../services/backup';
import { useSettingsStore } from '../../../store/settingsStore';
import { setDisguiseIcon, setFlagSecure } from '../../../utils/disguiseIcon';

interface SettingItem {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  type: 'toggle' | 'link';
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
}

export default function SettingsCenterScreen() {
  const { colors, isDark, toggleTheme, space, font, screenPadding, bottomTabSpacing, radius, clampSize , iconSize } = useTheme();
  const { themeMode, disguiseMode, updateSetting } = useSettingsStore();

  const screenAnimatedStyle = useScreenEnterAnimation();

  const iconOptionSize = clampSize(64, 88);
  const iconOptionImageSize = clampSize(32, 48);

  const [query, setQuery] = useState('');
  const [showAccessKeyAuthModal, setShowAccessKeyAuthModal] = useState(false);
  const [showDisplayNameModal, setShowDisplayNameModal] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [disguiseIconTheme, setDisguiseIconTheme] = useState(useSettingsStore.getState().disguiseIconTheme);
  const [screenshotProtection, setScreenshotProtection] = useState(useSettingsStore.getState().screenshotProtection);

  const handleAccessKeysPress = () => setShowAccessKeyAuthModal(true);
  const handleAccessKeyAuthSuccess = () => { setShowAccessKeyAuthModal(false); router.push('/(main)/settings/access-keys'); };

  const handleScreenshotProtectionChange = async (enabled: boolean) => {
    setScreenshotProtection(enabled);
    await updateSetting('screenshotProtection', enabled);
    await setFlagSecure(enabled);
  };

  const [backupProgress, setBackupProgress] = useState<{ message: string; progress: number } | null>(null);
  const [showBackupConfirm, setShowBackupConfirm] = useState(false);
  const [selectedBackupFolder, setSelectedBackupFolder] = useState<BackupFolderHandle | null>(null);
  const [backupEstimate, setBackupEstimate] = useState<BackupEstimate | null>(null);
  const [isCalculatingEstimate, setIsCalculatingEstimate] = useState(false);
  const [backupResult, setBackupResult] = useState<{ success: boolean; backupName?: string; fileSize?: number; error?: string } | null>(null);

  const [showRestorePassphrase, setShowRestorePassphrase] = useState(false);
  const [restorePassphraseInput, setRestorePassphraseInput] = useState('');
  const [pendingRestoreUri, setPendingRestoreUri] = useState<string | null>(null);

  const handleExport = async () => {
    setIsCalculatingEstimate(true);
    try {
      const estimate = await BackupService.calculateBackupSize();
      setBackupEstimate(estimate);
    } catch (e) {
      console.warn('Failed to calculate backup estimate:', e);
    }
    setIsCalculatingEstimate(false);

    const hasPermission = await BackupService.requestStoragePermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Storage permission is required to create backups.');
      return;
    }

    const folder = await BackupService.pickBackupFolder();
    if (!folder) return;
    setSelectedBackupFolder(folder);
    setShowBackupConfirm(true);
  };

  const handleBackupConfirm = async (passphrase: string | undefined) => {
    if (!selectedBackupFolder) return;
    setBackupProgress({ message: 'Starting backup...', progress: 0 });
    setBackupResult(null);
    const result = await BackupService.createBackupInFolder(selectedBackupFolder, passphrase, (message, progress) => {
      setBackupProgress({ message, progress });
    });
    setBackupProgress(null);
    setBackupResult({ success: result.success, backupName: result.backupName, fileSize: result.fileSize, error: result.error });
  };

  const handleBackupResultDismiss = () => {
    setBackupResult(null);
    setSelectedBackupFolder(null);
    setBackupEstimate(null);
  };

  const runRestore = async (backupUri: string, passphrase: string | undefined) => {
    setBackupProgress({ message: 'Starting restore...', progress: 0 });
    const result = await BackupService.restoreBackup(backupUri, passphrase, (message, progress) => {
      setBackupProgress({ message, progress });
    });
    setBackupProgress(null);

    if (result.needsPassphrase) {
      setPendingRestoreUri(backupUri);
      setShowRestorePassphrase(true);
      if (passphrase) {
        Alert.alert('Incorrect Passphrase', 'That passphrase did not decrypt this backup’s keys. Try again, or restore without keys.');
      }
      return;
    }

    if (result.success) {
      Alert.alert('Restore Complete', `Restored ${result.restoredFiles} files and ${result.restoredFolders} folders.`, [{ text: 'OK' }]);
    } else {
      Alert.alert('Restore Error', result.error || 'Failed to restore backup.');
    }
  };

  const handleImport = async () => {
    const backupUri = await BackupService.pickBackupFile();
    if (!backupUri) return;
    await runRestore(backupUri, undefined);
  };

  const handleRestorePassphraseSubmit = async () => {
    const uri = pendingRestoreUri;
    const passphrase = restorePassphraseInput;
    setShowRestorePassphrase(false);
    setRestorePassphraseInput('');
    setPendingRestoreUri(null);
    if (uri) await runRestore(uri, passphrase);
  };

  const handleRestorePassphraseSkip = async () => {
    const uri = pendingRestoreUri;
    setShowRestorePassphrase(false);
    setRestorePassphraseInput('');
    setPendingRestoreUri(null);
    if (uri) {
      Alert.alert(
        'Restore Complete (Keys Skipped)',
        'Vault structure and files were restored. Access/encryption keys were not, since no passphrase was provided — protected content will only open if the matching keys already exist on this device.'
      );
    }
  };

  const settingSections: { title: string; items: SettingItem[] }[] = [
    {
      title: 'Identity Disguise Shield',
      items: ([
        {
          id: 'calculator',
          title: 'Calculator Spoofing',
          description: 'Disguise app as calculator',
          icon: Calculator,
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
          icon: PencilLine,
          type: 'link' as const,
          onPress: () => {
            setDisplayNameInput(useSettingsStore.getState().disguiseAppName || '');
            setShowDisplayNameModal(true);
          },
        },
      ].filter(Boolean) as SettingItem[]),
    },
    {
      title: 'Visual Configurations',
      items: [
        {
          id: 'theme',
          title: isDark ? 'Dark Mode' : 'Light Mode',
          description: isDark ? 'AMOLED black theme' : 'Light theme',
          icon: isDark ? Moon : Sun,
          type: 'toggle',
          value: isDark,
          onValueChange: () => toggleTheme(),
        },
        {
          id: 'amoled',
          title: 'High Contrast AMOLED',
          description: 'Pure black for OLED displays',
          icon: Circle,
          type: 'toggle',
          value: themeMode === 'amoled',
          onValueChange: (val: boolean) => updateSetting('themeMode', val ? 'amoled' : 'dark'),
        },
        {
          id: 'customization',
          title: 'Customization',
          description: 'Theme and grid density options',
          icon: Palette,
          type: 'link',
          onPress: () => router.push('/(main)/settings/customization'),
        },
        {
          id: 'storage',
          title: 'Storage',
          description: 'Usage, limits, and device capacity',
          icon: HardDrive,
          type: 'link',
          onPress: () => router.push('/(main)/settings/storage'),
        },
      ],
    },
    {
      title: 'Access Key Control',
      items: [
        { id: 'passwords', title: 'Access Keys', description: 'Create, view, and manage access keys', icon: Lock, type: 'link', onPress: handleAccessKeysPress },
      ],
    },
    {
      title: 'Vault Authentication',
      items: [
        { id: 'auth-key', title: 'Authentication Key', description: 'Manage your vault authentication key', icon: Key, type: 'link', onPress: () => router.push('/(main)/settings/auth-key') },
      ],
    },
    {
      title: 'Security',
      items: [
        { id: 'screenshot-protection', title: 'Screenshot Protection', description: 'Block screenshots and screen recording', icon: ShieldAlert, type: 'toggle', value: screenshotProtection, onValueChange: handleScreenshotProtectionChange },
      ],
    },
  ];

  const q = query.trim().toLowerCase();

  const visibleSections = settingSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => !q || item.title.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q))),
    }))
    .filter(section => {
      if (section.items.length > 0) return true;
      if (!q && section.title === 'Identity Disguise Shield' && disguiseMode === 'calculator') return true;
      return false;
    });

  const renderItem = (item: SettingItem) => {
    if (item.type === 'toggle') {
      return (
        <Card key={item.id} style={{ marginBottom: space(2) }}>
          <SwitchRow label={item.title} description={item.description} icon={item.icon} value={!!item.value} onValueChange={(v) => item.onValueChange?.(v)} />
        </Card>
      );
    }
    const Icon = item.icon;
    return (
      <Card key={item.id} onPress={item.onPress} accessibilityLabel={item.title} style={{ marginBottom: space(2) }}>
        <View style={styles.settingContent}>
          <View style={[styles.settingIcon, { backgroundColor: `${colors.primary}15`, marginRight: space(3) }]}>
            <Icon size={iconSize(20)} strokeWidth={2} color={colors.primary} />
          </View>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingTitle, { color: colors.text, fontSize: font(Type.body.size) }]}>{item.title}</Text>
            {item.description && (
              <Text style={[styles.settingDescription, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>{item.description}</Text>
            )}
          </View>
          <ChevronRight size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <TabRootHeader title="Settings" tagline="Manage your preferences" />

      <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
        <ScrollView
          contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing + space(6) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderRadius: radius(5), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2), minHeight: MIN_TOUCH_TARGET }]}>
            <Search size={iconSize(18)} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, fontSize: font(Type.body.size) }]}
              placeholder="Search settings…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Search settings"
            />
          </View>

          {visibleSections.length === 0 && q ? (
            <EmptyState icon={Search} title="No results found" message="Try a different search term" />
          ) : (
            visibleSections.map((section) => (
              <View key={section.title} style={{ marginBottom: space(6) }}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted, fontSize: font(Type.eyebrow.size), marginBottom: space(3) }]}>{section.title}</Text>
                {section.items.map(renderItem)}
                {section.title === 'Identity Disguise Shield' && disguiseMode === 'calculator' && (
                  <Card style={{ marginBottom: space(2) }}>
                    <View style={styles.settingContent}>
                      <View style={[styles.settingIcon, { backgroundColor: `${colors.primary}15`, marginRight: space(3) }]}>
                        <Palette size={iconSize(20)} strokeWidth={2} color={colors.primary} />
                      </View>
                      <View style={styles.settingInfo}>
                        <Text style={[styles.settingTitle, { color: colors.text, fontSize: font(Type.body.size) }]}>Icon Theme</Text>
                        <Text style={[styles.settingDescription, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Home screen icon color</Text>
                      </View>
                    </View>
                    <View style={[styles.iconGrid, { gap: space(2), marginTop: space(3) }]}>
                      {[
                        { id: 'default', label: 'Default', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-white.png') },
                        { id: 'white', label: 'White', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-white.png') },
                        { id: 'orange', label: 'Orange', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-orange.png') },
                        { id: 'red', label: 'Red', source: require('../../../../assets/icons/calculator-icons/calculator-icon-black-red.png') },
                      ].map((theme) => (
                        <TouchableOpacity
                          key={theme.id}
                          onPress={async () => {
                            setDisguiseIconTheme(theme.id as any);
                            updateSetting('disguiseIconTheme', theme.id as any);
                            await setDisguiseIcon(theme.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${theme.label} icon theme`}
                          accessibilityState={{ selected: disguiseIconTheme === theme.id }}
                          style={[
                            styles.iconOption,
                            {
                              width: iconOptionSize,
                              height: iconOptionSize,
                              borderRadius: radius(5),
                              backgroundColor: colors.surfaceHover,
                              borderColor: disguiseIconTheme === theme.id ? colors.primary : colors.borderLight,
                              borderWidth: disguiseIconTheme === theme.id ? 2 : StyleSheet.hairlineWidth,
                            },
                          ]}
                        >
                          <Image source={theme.source} style={[styles.iconOptionImage, { width: iconOptionImageSize, height: iconOptionImageSize, borderRadius: radius(3) }]} resizeMode="contain" />
                          <Text style={[styles.iconOptionText, { color: colors.textMuted, fontSize: font(10) }]}>{theme.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Card>
                )}
              </View>
            ))
          )}

          <View style={{ marginBottom: space(6) }}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted, fontSize: font(Type.eyebrow.size), marginBottom: space(3) }]}>Data Continuity Engine</Text>
            <Card onPress={handleExport} accessibilityLabel="Create backup" style={{ marginBottom: space(2) }}>
              <View style={styles.settingContent}>
                <View style={[styles.settingIcon, { backgroundColor: `${colors.primary}15`, marginRight: space(3) }]}>
                  <Package size={iconSize(20)} strokeWidth={2} color={colors.primary} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: colors.text, fontSize: font(Type.body.size) }]}>Create Backup</Text>
                  <Text style={[styles.settingDescription, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Export vault to secure archive</Text>
                </View>
                <ChevronRight size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
              </View>
            </Card>
            <Card onPress={handleImport} accessibilityLabel="Restore backup">
              <View style={styles.settingContent}>
                <View style={[styles.settingIcon, { backgroundColor: `${colors.primary}15`, marginRight: space(3) }]}>
                  <Upload size={iconSize(20)} strokeWidth={2} color={colors.primary} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: colors.text, fontSize: font(Type.body.size) }]}>Restore Backup</Text>
                  <Text style={[styles.settingDescription, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Import vault from archive</Text>
                </View>
                <ChevronRight size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
              </View>
            </Card>
          </View>
        </ScrollView>
      </Animated.View>

      <AnimatedTabBar />

      <AccessKeyScreenAuthModal visible={showAccessKeyAuthModal} onClose={() => setShowAccessKeyAuthModal(false)} onSuccess={handleAccessKeyAuthSuccess} />

      <Dialog
        visible={backupProgress !== null}
        onRequestClose={() => {}}
        dismissOnBackdropPress={false}
        title={backupProgress && backupProgress.progress >= 100 ? 'Complete!' : 'Processing…'}
        message={backupProgress?.message || 'Please wait…'}
      >
        <View style={{ width: '100%', marginBottom: space(2) }}>
          <ProgressBar progress={(backupProgress?.progress ?? 0) / 100} />
        </View>
      </Dialog>

      <Dialog
        visible={backupResult !== null}
        onRequestClose={handleBackupResultDismiss}
        icon={backupResult?.success ? Package : ShieldAlert}
        iconColor={backupResult?.success ? colors.secondary : colors.error}
        title={backupResult?.success ? 'Backup Complete' : 'Backup Failed'}
        message={
          backupResult?.success
            ? `${backupResult.backupName ?? ''}${backupResult.backupName ? '\n' : ''}Size: ${(backupResult.fileSize ? backupResult.fileSize / 1024 / 1024 : 0).toFixed(2)} MB`
            : (backupResult?.error || 'Unknown error occurred')
        }
        actions={
          backupResult?.success
            ? [{ label: 'Done', onPress: handleBackupResultDismiss, variant: 'primary' }]
            : [
                { label: 'Dismiss', onPress: handleBackupResultDismiss, variant: 'tertiary' },
                { label: 'Retry', onPress: () => { handleBackupResultDismiss(); handleExport(); }, variant: 'primary' },
              ]
        }
      />

      <BackupConfirmDialog
        visible={showBackupConfirm}
        onClose={() => { setShowBackupConfirm(false); setSelectedBackupFolder(null); }}
        onConfirm={handleBackupConfirm}
        folderLabel={selectedBackupFolder?.label || ''}
        estimatedSize={backupEstimate?.estimatedZipSize}
        estimatedFileCount={backupEstimate?.totalFiles}
        isLoading={isCalculatingEstimate}
      />

      <Dialog
        visible={showRestorePassphrase}
        onRequestClose={handleRestorePassphraseSkip}
        title="Backup Passphrase Needed"
        message="This backup includes encrypted access/encryption keys. Enter the passphrase used when it was created to restore them, or skip to restore files without keys."
        actions={[
          { label: 'Skip', onPress: handleRestorePassphraseSkip, variant: 'tertiary' },
          { label: 'Restore Keys', onPress: handleRestorePassphraseSubmit, variant: 'primary' },
        ]}
      >
        <View style={{ width: '100%' }}>
          <TextField placeholder="Backup passphrase" value={restorePassphraseInput} onChangeText={setRestorePassphraseInput} secureToggle autoFocus accessibilityLabel="Backup passphrase" />
        </View>
      </Dialog>

      <Dialog
        visible={showDisplayNameModal}
        onRequestClose={() => setShowDisplayNameModal(false)}
        title="App Display Name"
        message="Enter the name to show on the home screen (leave empty to use default)"
        actions={[
          { label: 'Cancel', onPress: () => setShowDisplayNameModal(false), variant: 'tertiary' },
          { label: 'Save', onPress: () => { updateSetting('disguiseAppName', displayNameInput.trim()); setShowDisplayNameModal(false); }, variant: 'primary' },
        ]}
      >
        <View style={{ width: '100%' }}>
          <TextField placeholder="Deposito Seguro" value={displayNameInput} onChangeText={setDisplayNameInput} autoFocus accessibilityLabel="Display name" />
        </View>
      </Dialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  scrollBody: { paddingTop: 12 },

  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontWeight: '500' },

  sectionTitle: { fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },

  settingContent: { flexDirection: 'row', alignItems: 'center' },
  settingIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  settingInfo: { flex: 1 },
  settingTitle: { fontWeight: '700', letterSpacing: -0.2, marginBottom: 2 },
  settingDescription: { fontWeight: '500' },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  iconOption: { alignItems: 'center', justifyContent: 'center' },
  iconOptionImage: {},
  iconOptionText: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
});
