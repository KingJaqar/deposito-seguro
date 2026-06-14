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
    │   ├── index.tsx                        # Entry point redirect engine (Functions/Logic)
    │   ├── index.styles.ts                  # Layout properties for the entry point screen
    │   ├── _layout.tsx                     # Core zero-knowledge application boot gatekeeper
    │   ├── (auth)/
    │   │   ├── lock/
    │   │   │   ├── index.tsx                # Non-destructive session lock screen matrix (Logic)
    │   │   │   └── styles.ts                # Lock screen security pattern layouts & overlays
    │   │   ├── login/
    │   │   │   ├── index.tsx                # Dual-purpose portal (Standard / Calculator Skin Logic)
    │   │   │   └── styles.ts                # Pinpad UI styling & camouflage configurations
    │   │   ├── onboarding/
    │   │   │   ├── index.tsx                # First-time local installation setup intro (Logic)
    │   │   │   └── styles.ts                # Swiper styles, animations, and setup slide themes
    │   │   └── register/
    │   │       ├── index.tsx                # Zero-knowledge master payload provisioning (Logic)
    │   │       └── styles.ts                # Content layout, form fields, and error layouts
    │   └── (main)/
    │       ├── _layout.tsx                  # Automated background listener & hardware lock hook
    │       ├── dashboard/
    │       │   ├── index.tsx                # Space capacity metrics & allocation controller (Logic)
    │       │   └── styles.ts                # Metric wheels, capacity grids, and progress indicators
    │       ├── favorites/
    │       │   ├── index.tsx                # Fast-access pointer file shortcut directory (Logic)
    │       │   └── styles.ts                # Card matrix, grid list layouts, and row setups
    │       ├── search/
    │       │   ├── index.tsx                # Multi-mime global sandbox indexing search engine (Logic)
    │       │   └── styles.ts                # Search input headers, filters, and clean result spaces
    │       ├── trash/
    │       │   ├── index.tsx                # Multi-stage secure shredded retention queue (Logic)
    │       │   └── styles.ts                # Warning borders, delete actions, and queue rows
    │       ├── folder/
    │       │   └── [id]/
    │       │       ├── index.tsx            # Sandbox asset importer & partition view (Logic)
    │       │       └── styles.ts            # Dynamic grids, drag-and-drop overlays, list headers
    │       ├── settings/
    │       │   ├── customization/
    │       │   │   ├── index.tsx            # UI Skin swapping configuration layout (Logic)
    │       │   │   └── styles.ts            # Theme buttons, color bubbles, option cards
    │       │   ├── index/
    │       │   │   ├── index.tsx            # Global settings controller root file (Logic)
    │       │   │   └── styles.ts            # Action menus, profile panels, switch alignment
    │       │   └── storage/
    │       │       ├── index.tsx            # Hardware block storage telemetry data metrics (Logic)
    │       │       └── styles.ts            # Storage bars, disk segments, breakdown colors
    │       └── viewer/
    │           ├── document/
    │           │   ├── index.tsx            # Sandboxed plain text/doc secure memory preview (Logic)
    │           │   └── styles.ts            # Text containers, scrolling sheets, page counts
    │           ├── image/
    │           │   ├── index.tsx            # Memory-sweeping decrypted local image canvas (Logic)
    │           │   └── styles.ts            # Zoom layouts, bounding boxes, background backdrops
    │           └── video/
    │               ├── index.tsx            # Local loop stream asset execution matrix (Logic)
    │               └── styles.ts            # Player controls overlays, safe-area timelines
    ├── components/
    │   ├── AnimatedCard.tsx                 # Dynamic layout motion framework functions
    │   ├── AnimatedCard.styles.ts          # Motion boundaries, layer configurations, and absolute sizing
    │   ├── GridListToggle.tsx               # Workspace display visual switcher component logic
    │   ├── GridListToggle.styles.ts         # Icon boxes, active background slider styles
    │   ├── StyledButton.tsx                 # Master design system interactive click button logic
    │   ├── StyledButton.styles.ts           # Flex weights, structural padding, and active bounds
    │   └── VaultHeader.tsx                  # Cryptographic navigation top bar functional nodes
    │   └── VaultHeader.styles.ts            # Strict positioning layouts, elevation, status bar offsets
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
         └── index.ts                        # System data model definitions (Folder, File, Settings definitions)


   

