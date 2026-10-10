import { readdir, rename, rm, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'test portal');
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const [major, minor, patch, ...extraVersionParts] = packageJson.version.split('.');
if (patch === undefined || extraVersionParts.length > 0) {
  throw new Error(`Expected a three-part package version, received ${packageJson.version}`);
}
const versionedInstallerName = `Academic-3D-Test-Portal-Setup-${packageJson.version}.exe`;
const installerName = `Academic-3D-Test-Portal-Setup-${major}.${minor}.exe`;
const versionedInstallerPath = path.join(outputDirectory, versionedInstallerName);
const installerPath = path.join(outputDirectory, installerName);
const versionedBlockmapPath = `${versionedInstallerPath}.blockmap`;
const blockmapPath = `${installerPath}.blockmap`;
const latestYmlPath = path.join(outputDirectory, 'latest.yml');

if (versionedInstallerName !== installerName) {
  const versionedInstaller = await stat(versionedInstallerPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (versionedInstaller) {
    const versionedBlockmap = await stat(versionedBlockmapPath);
    const versionedLatestYml = await readFile(latestYmlPath, 'utf8');
    const metadataSize = versionedLatestYml.match(/^\s+size:\s+(\d+)\s*$/m);
    if (
      versionedInstaller.size < 10 * 1024 * 1024
      || versionedBlockmap.size === 0
      || !versionedLatestYml.includes(`version: ${packageJson.version}`)
      || !versionedLatestYml.includes(`path: ${versionedInstallerName}`)
      || Number(metadataSize?.[1]) !== versionedInstaller.size
    ) {
      throw new Error(`electron-builder output is incomplete for version ${packageJson.version}`);
    }
    await rename(versionedInstallerPath, installerPath);
    await rename(versionedBlockmapPath, blockmapPath);
    await writeFile(latestYmlPath, versionedLatestYml.replaceAll(versionedInstallerName, installerName));
  }
}

const installer = await stat(installerPath);
if (!installer.isFile() || installer.size < 10 * 1024 * 1024) {
  throw new Error(`Windows installer is unexpectedly small: ${installerPath}`);
}

const blockmap = await stat(blockmapPath);
if (!blockmap.isFile() || blockmap.size === 0) {
  throw new Error(`Windows installer blockmap is empty: ${blockmapPath}`);
}

const latestYml = await readFile(latestYmlPath, 'utf8');
const metadataSize = latestYml.match(/^\s+size:\s+(\d+)\s*$/m);
if (
  !latestYml.includes(`version: ${packageJson.version}`)
  || !latestYml.includes(`path: ${installerName}`)
  || Number(metadataSize?.[1]) !== installer.size
) {
  throw new Error(`latest.yml does not match installer version ${packageJson.version} or its file size`);
}

const entries = await readdir(outputDirectory, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory()) continue;
  if (!/^Academic(?:-3D-Test-Portal-Setup-| 3D Test Portal Setup ).+\.exe(?:\.blockmap)?$/.test(entry.name)) continue;
  if (entry.name === installerName || entry.name === `${installerName}.blockmap`) continue;
  await rm(path.join(outputDirectory, entry.name));
}

console.log(`Verified Windows installer ${installerName} (${Math.round(installer.size / 1024 / 1024)} MB) and removed stale installer files.`);
