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

The updater checks GitHub Releases in `bosscapsule/tep`. To publish an update:

1. Increase the `version` in `package.json` (for example, `1.2.0`).
2. Run `npm run electron:build`.
3. Create a GitHub Release with the new version tag, for example `v1.2.0`.
4. Upload the generated `Academic-3D-Test-Portal-Setup-1.2.0.exe`, its `.blockmap`, and `latest.yml` from `dist-electron/`.

The installed application checks for updates when it starts, downloads them, then closes and installs the update automatically. Changing the application name or icon also requires a new version and a new release.

## Application and installer icon

The current web icon is loaded from Icons8. The Windows installer icon must be a local `.ico` file; it is not taken from the web page. To replace it, put a multi-size Windows icon at `build/icon.ico`, then add `icon: build/icon.ico` under the top level of `electron-builder.yml` before building. A PNG can be converted to `.ico` with an image editor or an icon converter. The same new icon can be used in `public/manifest.json` and `index.html` for the web/PWA version.

There is no `Telegram` reference in the current source or installer configuration. The new NSIS display name is `Academic 3D Test Portal`, so a newly built installer will not contain that old word from this project.