# AgentLink updates

Android checks the official GitHub Releases feed once a day while the app is open. Use the update banner or **Settings → About → Version** to download the matching APK. Android asks you to confirm installation and checks the signing certificate. Builds installed through an app store should be updated through that store if signatures differ.

Starting with version 6, the launcher checks GitHub Releases shortly after startup and once an hour. It verifies the new launcher's SHA-256 and postpones the restart while ACP sessions are open or the launcher is starting or stopping OpenCode. The desktop OpenCode server stays running. Run the installer once to enable this feature on older launcher installations.

## Publishing update assets

Upload APKs named `AgentLink-X.Y.Z-<abi>.apk` or `AgentLink-X.Y.Z.apk` to a stable `vX.Y.Z` GitHub release. Keep the application ID and signing key consistent. Upload the assets directly to GitHub so the Releases API provides their SHA-256 digests.

For a launcher change, increment `VERSION` in `tools/launcher.js` and run `node scripts/build-launcher-update.mjs <output-directory>`. Attach the current `AgentLink-launcher-<revision>.cjs` to each stable release so a desktop that skipped a release can still update.
