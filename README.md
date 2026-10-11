# Academic 3D Test Portal

An academic testing application with 3D models, quizzes, and an admin mode.

## Run locally

```bash
npm install
npm run dev
```

To run the desktop version:

```bash
npm run electron:dev
```

## Super-admin password

The super-admin password is not stored in the source code. Set it in the shell before running Electron or building a release:

PowerShell:

```powershell
$env:ANATOMYZH_SUPER_PASSWORD = 'your-private-password'
npm run electron:dev
```

The desktop app stores the password encrypted in the operating system user-data directory after startup. Do not commit a `.env` file or put a real password in `.env.example`.

## Windows auto-update

Auto-update works only for an installed, packaged Windows build. It does not run from `npm run electron:dev` and it does not update a standalone `.exe` downloaded without installation.

The updater checks GitHub Releases in `bosscapsule/test-portal`. To publish an update:

1. Increase the three-part `version` in `package.json` (for example, `1.4.0`). The Windows build packages both x64 and ARM64 in one installer, for example `Academic-3D-Test-Portal-Setup-1.4.exe`.
2. Run `npm run electron:build`. The build writes to `test portal/`, verifies that the installer, blockmap, and `latest.yml` match the package version, then removes older setup files from that folder. If verification fails, the build exits with an error and leaves old installers in place.
3. Create a GitHub Release with the new version tag, for example `v1.4.0`.
4. Upload the generated installer, its `.blockmap`, and `latest.yml` from `test portal/`.

The installed application checks for updates when it starts, downloads them, then closes and installs the update automatically. To move existing installations from `bosscapsule/tep` to `bosscapsule/test-portal`, publish the migration version `1.3.0` with the same installer, `.blockmap`, and `latest.yml` in both repositories. This lets existing 1.2 installations find the migration update in the old repository, while version 1.3 and later check the new repository. Publish later versions only in `bosscapsule/test-portal`. Changing the application name or icon also requires a new version and a new release.

## Application and installer icon

The current web icon is loaded from Icons8. Windows desktop/app icons and the installer-file icon use separate files: `build/app-icon.ico` is the app/shortcut icon, and `build/installer-icon.ico` is the setup EXE icon. Add a different multi-size Windows icon at each path (including 16, 32, 48, and 256 px images). If you have PNG/JPG images, convert each one to `.ico` with an image editor first; renaming PNGs to `.ico` does not convert them.

To publish a changed Windows icon, increment the three-part version in `package.json`, run `npm run electron:build`, then publish the generated installer, `.blockmap`, and `latest.yml` in a matching GitHub Release as described above. The icon on installed applications changes after they install that release. The web/PWA icon is separate and is configured in `public/manifest.json` and `index.html`.

There is no `Telegram` reference in the current source or installer configuration. The new NSIS display name is `Academic 3D Test Portal`, so a newly built installer will not contain that old word from this project.