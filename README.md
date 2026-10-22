# FileVerse

**FileVerse is an experimental 3D desktop file browser that represents filesystem hierarchy as spatial depth.** It combines familiar folder navigation with a scene where files and folders appear as navigable cards.

![FileVerse current preview](./Current%20Preview.png)

> This screenshot shows the current UI direction. Browser preview uses sample data; the Tauri desktop app browses local directories.

## Project status

**Current milestone: MVP-0 spatial filesystem prototype — in progress.** Core browsing and the prepared macOS folder fixtures have been checked in the native app. The selected-root boundary and vertical depth movement are verified; horizontal/diagonal scroll mapping still needs confirmation on the physical trackpad. Windows and Linux validation is intentionally deferred to the platform-completion milestone.

| Area | Status |
|---|---|
| Tauri + React/TypeScript + Three.js app shell | Implemented |
| Rust-backed local directory access and common sidebar locations | Implemented; startup, sidebar navigation, picker selection/cancel, and folder navigation reported working |
| Spatial cards, folder navigation, Back, and breadcrumbs | Implemented; manually verified |
| Zoom, centered orbit, and depth controls | Implemented; vertical scroll was checked in the native app moving through loaded layers, while horizontal scroll and drag orbit around the loaded stack center |
| macOS empty, special-name, large-folder, permission, symlink, and mouse-drag checks | Verified in the Tauri desktop app; 9 Rust filesystem tests pass |
| Selected-root boundary; horizontal/diagonal gesture checks | Root boundary verified; physical trackpad checks remain in the [MVP-0 smoke checklist](./docs/MVP0_NATIVE_SMOKE_CHECKLIST.md) |
| Windows and Linux support validation | Deferred to the platform-completion milestone |

The [roadmap](./ROADMAP.md) is the source of truth for milestone progress and next steps. Keep it current as work is verified so a new contributor can see what is complete and where to continue.

## Current interaction

- Double-click a folder card to enter it; use Back or breadcrumbs to return.
- Pinch to zoom from 72% to 160%.
- Horizontal two-finger scrolling rotates the loaded stack around its center; vertical scrolling moves through its depth layers. Drag with the primary mouse button to control yaw and pitch. Yaw can complete full revolutions; pitch is bounded so the view does not flip.
- Use the on-screen depth controls to move through the already-loaded scene rows; Reset restores the default view.

MVP-0 is focused on proving spatial browsing. Search, previews, file operations, cloud storage, filesystem watchers, recursive indexing, and other production file-manager features are deferred.

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
- [Roadmap and progress tracker](./ROADMAP.md)
- [MVP-0 native smoke checklist](./docs/MVP0_NATIVE_SMOKE_CHECKLIST.md)
- [AI-agent contribution rules](./AGENTS.md)
