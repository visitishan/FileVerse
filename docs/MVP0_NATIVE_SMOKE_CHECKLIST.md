# MVP-0 Native Smoke Checklist

Run this checklist in the Tauri desktop app. The disposable fixtures are at `/private/tmp/FileVerseSmokeFixtures`. This is a hidden system-temp location, so in FileVerse click **Open Folder**, press **Command+Shift+G**, enter that path, press Return, then click **Open**.

Automated backend check: `cargo test` passed all 9 tests, covering empty/missing/restricted directories, Unicode and hidden names, symlinks, root boundaries, and large-directory truncation. These tests do not replace the native UI checks below.

## macOS

### Startup and local navigation

- [x] Launch FileVerse. It opens Home automatically without showing the folder picker. (User-confirmed.)
- [x] Open Desktop, Documents, and Downloads from the sidebar. Each shows real contents and updates the breadcrumb and details dock. (User-confirmed.)
- [x] Open a child folder, then use Back and a breadcrumb to return. Opening a sidebar location resets navigation to that location. (User-confirmed.)

### Folder picker and root boundary

- [x] From a local folder, choose **Open Folder** and select a disposable fixture root. The selected directory and its children appear. (User reports this works; also opened during this check.)
- [x] Cancel the picker. The current directory remains open and usable. (User reports this works.)
- [x] Select `/private/tmp/FileVerseSmokeFixtures/Permission Restricted`. FileVerse shows an access error and retains the previous folder. (Native UI verified.)
- [x] Open `/private/tmp/FileVerseSmokeFixtures/Symlink Check`. The `linked-directory` entry is shown as a non-enterable LINKED file card; double-click does not enter the target. (Native UI verified; backend test also passes.)
- [x] Open and return from nested folders. (User-confirmed.)
- [x] Verify in the native UI that navigation cannot escape the selected root. Opened a child of the selected fixture root; the parent breadcrumb above `FileVerseSmokeFixtures` was disabled and could not be entered. The backend also rejects outside-root paths in its automated test.

### Listing states

- [x] Open `/private/tmp/FileVerseSmokeFixtures/Empty Folder`. The empty-folder message appears and the app remains responsive. (Native UI verified.)
- [x] Open `/private/tmp/FileVerseSmokeFixtures/Special Names`. `résumé.txt`, `目录`, and `.hidden-note.txt` display correctly. (Native UI verified.)
- [x] Open `/private/tmp/FileVerseSmokeFixtures/Large Folder (301 files)`. The app remains responsive and reports “Showing first 300 of a large folder · 300 loaded.” (Native UI verified.)

### Spatial controls

- [x] Pinch to zoom in and out. (User-confirmed.)
- [x] Zoom buttons reach both 72% and 160%; Reset returns to 100%. (Native UI verified.)
- [x] Orbit the scene through a full 360° yaw. (User-confirmed in the desktop app.)
- [x] Verify on the physical trackpad that horizontal scroll orbits around the center of the loaded card stack and diagonal scroll combines orbit with depth travel. (User-confirmed: both gestures work correctly.)
- [x] Vertical scrolling moves the native camera into the loaded layers; the active folder stays unchanged. (Checked on a multi-row Home directory.)
- [x] Primary-button mouse drag rotates the scene; dragging over empty scene space did not open a folder or change the current directory. (Native UI verified.)
- [x] Use the on-screen depth controls to move through loaded rows. (User-confirmed.)
- [x] Reset restores the default view. (User-confirmed and exercised during this check.)
- [x] Confirm horizontal and diagonal camera input leaves the active directory and selection unchanged. (User-confirmed during the same gesture check.)

## Deferred platform checks

Windows and Linux checks are intentionally deferred until the platform-completion milestone. Do not claim support for those platforms until their startup, picker, navigation, filesystem, and spatial-control checks have been run.
