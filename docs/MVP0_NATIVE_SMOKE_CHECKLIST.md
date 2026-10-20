# MVP-0 Native Smoke Checklist

Run this checklist in the packaged or development Tauri desktop app. Use disposable folders under the system temporary directory; do not use folders containing important data for destructive experiments.

## macOS

### Startup and local navigation

- [ ] Launch FileVerse. It opens Home automatically without showing the folder picker.
- [ ] Open Desktop, Documents, and Downloads from the sidebar. Each shows real contents and updates the breadcrumb and details dock.
- [ ] Open a child folder, then use Back and a breadcrumb to return. Opening a sidebar location resets navigation to that location.

### Folder picker and root boundary

- [ ] From a local folder, choose **Open Folder** and select a disposable fixture root. The selected directory and its children appear.
- [ ] Cancel the picker. The current directory remains open and usable.
- [ ] Select a fixture folder that cannot be listed, if macOS privacy permissions permit creating one. The app shows an error and retains the previous root.
- [ ] Try navigating through a symlink to a directory. It is visible as a link but does not enter the target.

### Listing states

- [ ] Open an empty folder. The empty-folder message appears and the app remains responsive.
- [ ] Open a folder with names such as `résumé.txt`, `目录`, and `.hidden-note.txt`. Names display correctly and hidden status is preserved.
- [ ] Open a folder containing more than 300 entries. The status bar reports truncation; the app remains responsive.
- [ ] Open and return from nested folders. The selected root boundary prevents navigating outside the chosen root.

### Spatial controls

- [ ] Pinch to zoom out/in, including the 160% limit.
- [x] Orbit the scene through a full 360° yaw in the desktop app. The user has confirmed that the scene completes a full rotation; separately verify each input method below.
- [ ] Two-finger horizontal, vertical, and diagonal scrolling changes orbit yaw and pitch without changing selection or directory; pitch stays within safe limits.
- [ ] Primary-button mouse drag changes orbit yaw and pitch without activating a card.
- [ ] Use the on-screen depth controls to move through loaded rows, clamp at the scene boundary, and return toward the entrance without requesting more filesystem data.
- [ ] Reset restores the default zoom, orbit, and depth position.

## Windows and Linux follow-up

Repeat startup, picker, local-location, navigation, permission, Unicode, symlink, 300+ entry, and spatial-control checks on each OS before claiming platform support. Record OS version and any platform-specific differences in the roadmap review notes.
