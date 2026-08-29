/**
 * I-11 residual (plans/deposito-seguro-audit-report-2026-08-28.md §11/§20,
 * plans/what-are-the-next-jaunty-deer.md item 6): persistSnapshot used to
 * fire AsyncStorage.setItem(...).catch(console.error) without ever being
 * awaited by its callers, so a write failure was invisible to both the
 * store and its callers. This exercises the two deliberately-different
 * failure postures the fix landed with (see settingsStore.ts's own
 * comments for the reasoning on each):
 *  - updateSetting swallows a persist failure itself (it has ~15
 *    fire-and-forget UI call sites with no catch of their own) — the
 *    setting still applies in memory, the failure is only logged.
 *  - createAccessKey/deleteAccessKey (the identity/security-key mutators)
 *    let the failure surface to their caller, since access-keys.tsx and
 *    AccessKeyRegistrationModal.tsx already have their own try/catch
 *    specifically anticipating this.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../settingsStore';
import { sanitizeSecureStoreKey } from '../../utils/secureStoreKey';

const SETTINGS_KEY = sanitizeSecureStoreKey('@vault_settings');

describe('settingsStore I-11 residual: persistence durability on a simulated AsyncStorage failure', () => {
  beforeEach(() => {
    useSettingsStore.setState({ accessKeys: [], encryptionKeys: [], storageLimitBytes: null });
    jest.restoreAllMocks();
  });

  it('persists normally when AsyncStorage succeeds', async () => {
    await useSettingsStore.getState().updateSetting('viewMode', 'small-icons');

    expect(useSettingsStore.getState().viewMode).toBe('small-icons');
    const stored = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) as string);
    expect(stored.viewMode).toBe('small-icons');
  });

  it('updateSetting swallows a persist failure: the in-memory value still applies, no rejection reaches the caller', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(useSettingsStore.getState().updateSetting('viewMode', 'large-icons')).resolves.toBeUndefined();

    expect(useSettingsStore.getState().viewMode).toBe('large-icons');
  });

  it('createAccessKey rejects when the persist write fails, so its callers\' existing try/catch actually fires', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(useSettingsStore.getState().createAccessKey('Vault', 'pw123')).rejects.toThrow('disk full');

    // Optimistic in-memory update (same convention as vaultStore.ts's
    // commitVaultState — see that file's own comment): the key exists for
    // the rest of this session even though the write that would let it
    // survive a restart failed.
    expect(useSettingsStore.getState().accessKeys).toHaveLength(1);
  });

  it('deleteAccessKey reports "persist-failed" (distinct from "not-found") rather than throwing when the persist write fails, and the key is actually gone from memory', async () => {
    await useSettingsStore.getState().createAccessKey('Vault', 'pw123');
    const id = useSettingsStore.getState().accessKeys[0].id;

    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    const result = await useSettingsStore.getState().deleteAccessKey(id);

    // Regression test for a real bug: the old contract collapsed this case
    // into 'not-found', which told the caller (access-keys.tsx) to tell the
    // user "this access key no longer exists" — misleading, since the key
    // WAS just found and removed from in-memory state (asserted below); only
    // the write that would make that removal survive an app restart failed.
    expect(result).toBe('persist-failed');
    expect(useSettingsStore.getState().accessKeys).toHaveLength(0);
  });

  it('deleteAccessKey still reports "not-found" for a genuinely nonexistent id (no persist attempted)', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
    setItemSpy.mockClear();

    const result = await useSettingsStore.getState().deleteAccessKey('does-not-exist');

    expect(result).toBe('not-found');
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
