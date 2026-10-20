# FileVerse

**FileVerse is an experimental 3D desktop file browser that turns folder hierarchy into spatial depth.** Instead of presenting a directory only as a flat list, it lays out files and folders as cards in a navigable scene.

![FileVerse current preview](./Current%20Preview.png)

> The screenshot shows the current spatial UI prototype. The browser preview uses sample data; the Tauri desktop app can browse local directories.

## What works today

- Tauri 2 desktop shell with a React, TypeScript, and Three.js interface.
- Rust-backed local directory listing, starting from the Home directory, with an option to choose another folder.
- Spatial folder and file cards, selection, open-folder navigation, Back, and breadcrumbs.
- Smooth depth transitions when navigating between folders.
- Bounded zoom (72%–160%), gentle horizontal camera orbit, and forward/back travel through loaded scene depth.
- Accessible on-screen controls for zoom, depth travel, and resetting the camera view.
- Lazy, direct-child directory listing with a cap; the app does not recursively index the selected root or follow symlinks into folders.

FileVerse is an early MVP-0 prototype. Search, previews, file operations, cloud storage, watchers, and other production file-manager features are not part of this milestone.

## Run locally

### Browser preview

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

The browser preview uses fixture data and does not access the host filesystem.

### Tauri desktop app

Requires Node.js, the stable Rust toolchain, and the platform prerequisites for [Tauri 2](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev
```

## Project documents

- [Product specification](./FileVerse_PROJECT_SPEC.md)
- [Architecture](./ARCHITECTURE.md)
- [Roadmap](./ROADMAP.md)
- [AI-agent contribution rules](./AGENTS.md)

## Current milestone

MVP-0 is focused on proving the spatial browsing concept and core directory navigation. Next work should be guided by the roadmap and feedback from using the desktop prototype.
