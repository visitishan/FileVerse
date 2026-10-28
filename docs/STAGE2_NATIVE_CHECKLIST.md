# Stage 2 Native Checklist

Run these checks in the Tauri desktop app with the selected root set to the FileVerse project folder unless a case says otherwise. Do not preview credentials, keys, private documents, or unrelated personal files.

## Bounded text preview

- [x] Select `README.md` and click **Preview**. Text appears in a readable panel without changing directories. (Native UI verified.)
- [x] Preview a text file larger than 64 KiB. The 70 KiB fixture showed the truncation note; the panel displayed only the bounded prefix. (Native UI verified.)
- [x] Select a file with an unsupported extension, such as a PNG image. **Preview** stays disabled. (Native UI verified.)
- [x] Select a supported extension containing non-UTF-8/binary data. The backend rejects it with a clear message and does not display raw binary. (Native UI verified.)
- [x] Close the panel with its close button and Escape. (Native UI verified.)

## Scope and safety

- [x] Preview a symlink entry. The preview action is unavailable; a Rust fixture test also confirms backend rejection. (Native UI and backend verified.)
- [x] Confirm a file outside the selected root cannot be previewed by the command boundary. (Rust fixture test verified `OUTSIDE_SELECTED_ROOT`.)
- [x] Confirm previewing a truncated file does not load the remainder into memory or block directory navigation. The native app navigated Home after opening the truncated preview; the backend reads at most 64 KiB plus one byte to detect truncation. (Native UI and code-path verified.)

Automated backend coverage: `cargo test` passes all 24 tests, including preview size limits, unsupported extensions, invalid UTF-8, symlink rejection, selected-root boundaries, and file-operation validation.

Windows and Linux checks remain deferred to Stage 4.
