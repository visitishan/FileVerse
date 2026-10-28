# Stage 3 Native Checklist

Use a disposable fixture as the selected root. Do not run mutation checks against Home, the project folder, or personal directories.

## Create Folder — macOS

- [x] Open the create dialog and confirm the folder-name field receives focus. (Native UI verified.)
- [x] Cancel creation and confirm the directory stays unchanged. (Native UI verified.)
- [x] Submit a name containing `/` and confirm FileVerse explains that separators are not allowed and creates nothing. (Native UI verified.)
- [x] Submit a name that already exists and confirm the existing item remains unchanged. (Native UI and Rust fixture verified.)
- [x] Create a valid folder and confirm it appears in the refreshed list and selected-item details. (Native UI verified.)
- [x] Confirm backend rejects a parent outside the selected root. (Rust fixture verified.)

## Rename — macOS

- [x] Rename a file and a folder; confirm the refreshed list and selected-item details show the new name. (Native UI verified.)
- [x] Try a destination name that already exists; confirm the original and destination remain unchanged. (Native UI verified; backend fixture also checked destination contents.)
- [x] Try a name containing path separators; FileVerse explains the issue and leaves the item unchanged. (Native UI verified.)
- [x] Cancel the rename dialog and confirm the filesystem stays unchanged. (Native UI verified.)
- [x] Backend fixture checks cover successful file rename, collisions, invalid names, root and out-of-root boundaries, and symlink rejection. (`cargo test`.)

## Copy one regular file — macOS

Use a disposable selected root and a source file that is safe to duplicate.

- [x] Select a regular file, choose a nested destination inside the selected root, and confirm the copy appears there with the same name and contents. (Native UI verified; source and copy compared byte-for-byte.)
- [x] Cancel the destination picker and confirm the existing destination remains unchanged. (Native UI verified; fixture contents checked.)
- [x] Choose a destination that already contains the same name; confirm FileVerse reports the collision and preserves both files. (Native UI and backend fixture verified.)
- [x] Select a symlink and confirm Copy is unavailable. Backend rejects symlink sources. (Native UI and Rust fixture verified.)
- [x] Choose a folder outside the selected root and confirm the backend rejects the destination without writing there. (Native UI and Rust fixture verified.)
- [x] Re-enter the nested destination and confirm the copied file appears in the refreshed listing; completion message names the destination. (Native UI verified.)

Windows and Linux checks remain deferred to Stage 4.
