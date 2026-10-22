# Stage 2 Native Checklist

Run these checks in the Tauri desktop app with the selected root set to the FileVerse project folder unless a case says otherwise. Do not preview credentials, keys, private documents, or unrelated personal files.

## Bounded text preview

- [x] Select `README.md` and click **Preview**. Text appears in a readable panel without changing directories. (Native UI verified.)
- [ ] Preview a text file larger than 64 KiB. The preview ends at the limit and shows the truncation note.
- [ ] Select a file with an unsupported extension, such as a PNG image. **Preview** stays disabled.
- [ ] Select a supported extension containing non-UTF-8/binary data. The backend rejects it with a clear message and does not display raw binary.
- [ ] Close the panel with its close button and Escape.

## Scope and safety

- [ ] Preview a symlink entry. The preview action is unavailable; the backend also rejects symlink traversal.
- [ ] Confirm a file outside the selected root cannot be previewed by the command boundary.
- [ ] Confirm previewing a truncated file does not load the remainder into memory or block directory navigation.

Windows and Linux checks remain deferred to Stage 4.
