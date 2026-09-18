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

  // Regression tests for the manual folders/files allowlists in
  // createBackupManifest (plans/album implementation plan.md §1's `type`
  // fix, and a real gap found re-verifying §1a against backup/restore: an
  // unbacked-up iconPath/iconEncrypted silently reverts a restored media
  // file's thumbnail to useFileThumbnailUri's pre-§1a fallback, which is
  // flat-out broken — not just lower quality — for an encrypted file, since
  // that fallback is file.localPath, which is ciphertext).
  it('carries an album folder\'s type through to the manifest, not silently reverting it to a plain folder', async () => {
    useVaultStore.setState({
      folders: [{
        id: 'album-1', name: 'My Album', type: 'album',
        isFavorite: false, isPersonalFavoritesFolder: false, createdAt: Date.now(),
      }],
      files: [],
    });
    const manifest = await EnhancedBackupService.createBackupManifest(undefined);
    expect(manifest.vaultStructure.folders[0].type).toBe('album');
  });

  it('carries a media file\'s iconPath/iconEncrypted through to the manifest', async () => {
    useVaultStore.setState({
      folders: [],
      files: [{
        id: 'file-1', folderId: 'album-1', name: 'photo.jpg', size: 1234,
        mimeType: 'image/jpeg', localPath: '/sandbox/file-1_photo.jpg.enc',
        iconPath: '/sandbox/file-1_photo.jpg.thumb.jpg.enc', iconEncrypted: true,
        isEncrypted: true, encryptionKeyId: 'ek-1',
        isFavorite: false, isTrash: false, importedAt: Date.now(),
      }],
    });
    const manifest = await EnhancedBackupService.createBackupManifest(undefined);
    expect(manifest.vaultStructure.files[0].iconPath).toBe('/sandbox/file-1_photo.jpg.thumb.jpg.enc');
    expect(manifest.vaultStructure.files[0].iconEncrypted).toBe(true);
  });
});

