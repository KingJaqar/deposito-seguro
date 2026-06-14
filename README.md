# deposito-seguro
A vault storage mobile app for storing photos, videos and other files with encryption developed using React Native Expo


**Project Description:**

Deposito Seguro is created to store personal/sensitive photos, videos, and other files for privacy and as a personal storage app, the app is locked with a password requiring the user to create their own password for protection purposes, encryption for folders and specific files is optional for the user. Local storage is used instead of cloud for the database since this is a personal project, stored files can only be recovered in the device the app was installed on, downloadable backup contents in zip will be available for backups. React Native Expo framework will be used to develop this project since it is a modern framework, flexible and much easier to deal with in terms of development, AI autonomous coding will be part of the project too. 


**Features:**

1. App Password
2. Create Folders for Storing Files
3. Specific File Encryption
4. Downloadable Content Zip Backup
5. App Disguise and Stealth
6. Customization

**Scope, Delimitations and Limitations**

**Scope**

- A personal vault storage mobile application
- Password authentication
- Optional encryption for specific chosen files
- App camouflaged / mask option
- Friendly and customizable UI for personal preference
- Backup availability
- Internet connection is not required

**Delimitations**  

- No usage of cloud storage or no moving files to cloud storage option
- Stored files can only accessed in the local storage of the device the vault app were installed
- No usage of cloud database (e.g firebase, supabase, mongoDB atlas & realm)
- Manual backup instead of automatic backup since no cloud storage were utilized

**Limitations**

- Local storage as the database might eat up high memory usage
- Large files could be too big to be stored
- If device was lost, then stored files will also be lost

**Source Code File Structure**

    deposito-seguro/
    ├── app.json                                 # OS manifest permissions (FaceID strings & sandboxing)
    ├── package.json                             # Structural frozen dependency engine tree
    ├── tsconfig.json 
    └── src/
    ├── app/
    │   ├── _layout.tsx                      # Core zero-knowledge application boot gatekeeper
    │   ├── (auth)/
    │   │   ├── lock.tsx                     # Non-destructive session lock screen matrix
    │   │   ├── login.tsx                    # Dual-purpose portal (Standard / Calculator Skin)
    │   │   ├── onboarding.tsx               # First-time local installation setup intro
    │   │   └── register.tsx                 # Zero-knowledge master payload provisioning
    │   └── (main)/
    │       ├── _layout.tsx                  # Automated background listener & hardware lock hook
    │       ├── dashboard.tsx                # Space capacity metrics & allocation controller
    │       ├── favorites.tsx                # Fast-access pointer file shortcut directory
    │       ├── search.tsx                   # Multi-mime global sandbox indexing search engine
    │       ├── trash.tsx                    # Multi-stage secure shredded retention queue
    │       ├── folder/
    │       │   └── [id].tsx                 # Sandbox asset importer & partition view
    │       ├── settings/
    │       │   ├── customization.tsx        # UI Skin swapping configuration layout (AMOLED/Light)
    │       │   ├── index.tsx                # Global settings controller root file
    │       │   └── storage.tsx              # Hardware block storage telemetry data metrics
    │       └── viewer/
    │           ├── document.tsx             # Sandboxed plain text/doc secure memory preview canvas
    │           ├── image.tsx                # Memory-sweeping decrypted local image rendering canvas
    │           └── video.tsx                # Local loop stream asset execution matrix
    ├── components/
    │   ├── AnimatedCard.tsx                 # Dynamic layout motion framework
    │   ├── GridListToggle.tsx               # Workspace display visual switcher
    │   ├── StyledButton.tsx                 # Master design system interactive click button
    │   └── VaultHeader.tsx                  # Cryptographic navigation top bar
    ├── constants/
    │   └── Colors.ts                        # Camouflage theme multi-skin palette hex variables
    ├── contexts/
    │   └── ThemeContext.tsx                 # Real-time skin swapping state rendering context
    ├── hooks/
    │   └── useFileSystemQuery.ts            # Local hierarchy path metadata collection query hook
    ├── security/
    │   ├── biometrics.ts                    # Native iOS FaceID / Android Biometric hardware platform bridge
    │   └── crypto.ts                        # 5,000-cycle local iteration security hashing engine
    ├── services/
    │   ├── backup.ts                        # Non-cloud local manifest backup file stream matrix
    │   └── storage.ts                       # Physical sandbox sector directory read/write manager
    ├── store/
    │   ├── authStore.ts                     # State machine managing zero-knowledge app lock variables
    │   ├── settingsStore.ts                 # Local state tracker for layout schemes and disguise states
    │   └── vaultStore.ts                    # Physical core engine managing files, directories, & trash state
    └── types/
    └── index.ts                         # System data model definitions (Folder, File, Settings definitions) 




   

