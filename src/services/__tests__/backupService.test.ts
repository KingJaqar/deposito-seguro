/**
 * Focused test for the Phase 3 "full portable backup" key-material
 * encryption (plans/deposito-seguro-audit-report.md §20) — the manifest's
 * accessKeys/encryptionKeys secrets, encrypted under a backup passphrase.
 * Only exercises createBackupManifest()/the crypto round-trip, not the
 * filesystem/zip machinery (that needs a real device to verify end-to-end).
 */
import { SecureCrypto } from '../../security/crypto';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { EnhancedBackupService } from '../backupService';

describe('EnhancedBackupService.createBackupManifest', () => {
  beforeEach(() => {
    useVaultStore.setState({ folders: [], files: [] });
    useSettingsStore.setState({
      accessKeys: [{ id: 'ak-1', label: 'My Key', password: 'super-secret-pw', fingerprint: 'fp', createdAt: Date.now() }],
      encryptionKeys: [{ id: 'ek-1', name: 'My Enc Key', key: 'raw-encryption-key', fingerprint: 'fp', createdAt: Date.now() }],
    });
  });

  it('omits keyMaterial when no passphrase is given', async () => {
    const manifest = await EnhancedBackupService.createBackupManifest(undefined);
    expect(manifest.keyMaterial).toBeUndefined();
  });

  it('encrypts real access/encryption key secrets under the backup passphrase, decryptable with it', async () => {
    const manifest = await EnhancedBackupService.createBackupManifest('correct horse battery staple');
    expect(manifest.keyMaterial).toBeDefined();
    expect(manifest.keyMaterial!.ciphertext).not.toContain('super-secret-pw');
    expect(manifest.keyMaterial!.ciphertext).not.toContain('raw-encryption-key');

    const derivedKey = await SecureCrypto.hashPassword('correct horse battery staple', manifest.keyMaterial!.salt);
    const payloadBase64 = await SecureCrypto.decrypt(manifest.keyMaterial!.ciphertext, derivedKey);
    const payload = JSON.parse(SecureCrypto.base64ToUtf8(payloadBase64));

    expect(payload.accessKeys[0].password).toBe('super-secret-pw');
    expect(payload.encryptionKeys[0].key).toBe('raw-encryption-key');
  });

  it('fails to decrypt with the wrong passphrase', async () => {
    const manifest = await EnhancedBackupService.createBackupManifest('right-passphrase');
    const wrongDerivedKey = await SecureCrypto.hashPassword('wrong-passphrase', manifest.keyMaterial!.salt);
    await expect(SecureCrypto.decrypt(manifest.keyMaterial!.ciphertext, wrongDerivedKey)).rejects.toThrow();
  });
});
