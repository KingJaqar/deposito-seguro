# Deposito Seguro

Deposito Seguro is a local-first vault app for keeping personal files private, organised, and easy to find. Your vault stays on the device: there is no account, cloud sync, or server connection.

## What you can do

- Set a six-digit master PIN and an optional reminder hint.
- Lock the app automatically after it has been in the background for a minute.
- Create vault folders, subfolders, and media-only albums.
- Import files into folders, or add photos and videos to albums.
- Browse photos, videos, PDFs, Word documents, OpenDocument text files, spreadsheets, and text files in the app where supported.
- Search across the vault and filter by images, videos, documents, audio, apps, other files, or favourites.
- Rename, move, copy, cut, paste, duplicate, export, favourite, and bulk-manage files and folders.
- Add custom cover images to folders and albums.
- Protect a file or folder with an extra access-key password.
- Move items to Trash, restore them later, or delete them permanently.
- Create a ZIP backup and restore it later. An optional backup passphrase includes saved access-key material.
- Choose light, dark, or AMOLED themes; change the list/grid layout and text size.
- Use an optional calculator-style disguise. Android builds also support calculator launcher-icon choices and screenshot protection.

## How it works

Files and vault details are stored in the app's private device storage. The master PIN and access-key secrets use the device's secure storage on native apps. The app does not use a cloud database or upload your vault contents.

Albums are for photos and videos only. They stay at the top level and group media by import date. Folders can contain files and subfolders.

## Security notes

The master PIN is stored as a salted, iterated hash. After five incorrect PIN or access-key attempts, the app temporarily blocks more attempts for 30 seconds.

Access keys add another password check inside the app. They are separate from the master PIN.

The source includes file-encryption support for compatible vault data, but the current interface does not offer controls to create encryption keys or encrypt individual files or folders. This build should therefore not be described as offering user-managed file encryption.

## Backups and limits

Backups are manual. Create them from **Settings → Create Backup** and keep the ZIP somewhere safe. Restoring without the backup passphrase can restore the files and folder structure, but protected items may still need matching keys already on the device.

If the device is lost, damaged, or its app data is erased before you make a backup, the vault may not be recoverable. Exported files are shared outside the vault, so handle them carefully.

The Storage screen shows vault usage, available device space, and an optional vault-size limit. Large files and copies use real device storage.

## Built with

React Native, Expo SDK 57, Expo Router, Zustand, and local device storage.
