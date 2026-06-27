// File: src/app/(main)/settings/index.tsx
import { router } from 'expo-router';
import { Moon, Search, Sun } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
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
  icon: string;
  type: 'toggle' | 'link';
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
}

export default function SettingsCenterScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { themeMode, disguiseMode, biometricsEnabled, updateSetting } = useSettingsStore();

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
          icon: '🧮',
          type: 'toggle' as const,
          value: disguiseMode === 'calculator',
          onValueChange: (val: boolean) => updateSetting('disguiseMode', val ? 'calculator' : 'default'),
        },
      ] as SettingItem[],
    },
    {
      title: 'Visual Configurations',
      items: [
        {
          id: 'theme',
          title: isDark ? 'Dark Mode' : 'Light Mode',
          description: isDark ? 'AMOLED black theme' : 'Light cream theme',
          icon: isDark ? '🌙' : '☀️',
          type: 'toggle' as const,
          value: isDark,
          onValueChange: () => toggleTheme(),
        },
        {
          id: 'amoled',
          title: 'High Contrast AMOLED',
          description: 'Pure black for OLED displays',
          icon: '⚫',
          type: 'toggle' as const,
          value: themeMode === 'amoled',
          onValueChange: (val: boolean) => updateSetting('themeMode', val ? 'amoled' : 'dark'),
        },
      ] as SettingItem[],
    },
    {
      title: 'Hardware Biometrics',
      items: [
        {
          id: 'biometrics',
          title: 'Require Biometric Challenge',
          description: 'Use fingerprint or face recognition',
          icon: '🔐',
          type: 'toggle' as const,
          value: biometricsEnabled,
          onValueChange: (val: boolean) => updateSetting('biometricsEnabled', val),
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
          icon: '🔒',
          type: 'link' as const,
          onPress: () => router.push('/(main)/settings/access-keys'),
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
          icon: '🔑',
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
            <Text style={{ fontSize: 22 }}>{item.icon}</Text>
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
});