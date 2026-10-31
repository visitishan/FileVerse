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

## Move one regular file — macOS

Use a disposable selected root and a source file that is safe to move.

- [x] Move a regular file into a nested destination inside the selected root; confirm it appears there with the same name and contents and is gone from the source listing. (Native UI and byte-for-byte fixture check passed.)
- [x] Cancel the destination picker and confirm the source remains unchanged. (Native UI and fixture contents verified.)
- [x] Choose a destination that already contains the same name; confirm FileVerse reports the collision and preserves both files. (Native UI and fixture contents verified.)
- [x] Select a symlink and confirm Move is unavailable; backend rejects symlinks. (Native UI disabled the action; Rust handler checks `symlink_metadata` and rejects symlinks.)
- [x] Choose a folder outside the selected root and confirm the backend rejects the destination without writing there. (Native UI surfaced the selected-root boundary error; outside fixture remained empty.)
- [ ] Choose a destination on another storage volume or a filesystem that disallows hard links; confirm the move fails safely and the source remains. (No second storage volume is available on this Mac. Rust fixture injects the cross-device error and verifies `MOVE_UNSUPPORTED`, source preservation, and no destination file.)
- [x] Re-enter the destination and confirm the moved file appears in the refreshed listing; completion message names the destination. (Native UI verified both source refresh and destination listing.)

## Move to system Trash — macOS

Use a disposable selected root and only fixture items that can safely be restored or discarded.

Verification note (2026-10-31): The project-local macOS app was rebuilt with the current interface. The macOS picker initially appeared disabled while it was not focused; after focusing the dialog, the fixture root opened normally. A regular file and a folder were moved to system Trash and checked at their expected `~/.Trash` paths. A nested file was present inside the trashed folder. The temporary fixture directory was cleaned up; the two test items remain recoverable in macOS Trash.

- [x] Cancel the confirmation for a regular file and confirm it stays in the source listing. (Native UI verified.)
- [x] Confirm Move to Trash for a regular file; confirm it disappears from FileVerse and appears in macOS Trash. (Native UI success message and source refresh verified; exact Trash path checked.)
- [x] Confirm Move to Trash for a folder; confirm the warning says its contents move together and the folder appears in Trash. (Native UI warning and success message verified; folder and nested file checked in Trash.)
- [x] Select the root or a symlink and confirm Move to Trash is unavailable. (Native UI verified for selected root and symlink.)
- [x] Confirm the backend rejects the selected root and an out-of-root path without changing either location. (Rust fixture verified; direct UI command invocation was not needed.)
- [x] Confirm the source directory refreshes and FileVerse explains that restoration is available through macOS Trash. (Native UI success message and refreshed listing verified.)
- [x] Inject a Trash adapter failure and confirm it returns `TRASH_FAILED` while leaving the source item intact. (Rust fixture verified; the UI maps this code to a clear message. A native UI failure injection was not performed.)

Windows and Linux checks remain deferred to Stage 4.
