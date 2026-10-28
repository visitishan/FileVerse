# FileVerse Architecture

> Technical direction for the first implementation milestone. This document translates the available FileVerse project context into a buildable architecture while keeping MVP-0 focused on proving the spatial 3D filesystem concept.

**Status:** Proposed baseline for MVP-0  
**Product source:** [`FileVerse_PROJECT_SPEC.md`](FileVerse_PROJECT_SPEC.md)  
**Decision rule:** Prefer the smallest implementation that demonstrates the core interaction. Revisit decisions when a concrete product requirement or measured limitation justifies it.

---

## 1. Product and MVP boundary

FileVerse is a cross-platform desktop file browser that makes filesystem hierarchy spatial: X and Y organize objects, while Z communicates hierarchy and context. The active directory is identified by breadcrumbs and the details dock; its direct files and subfolders occupy the primary scene and recede into depth. The 3D view is the primary experience; familiar controls such as breadcrumbs and Back remain available.

### MVP-0 proves

1. FileVerse opens the user's Home directory automatically and can switch to another chosen directory; real entries appear in the 3D scene.
2. Spatial position and depth communicate the active directory's contents and hierarchy; the open directory itself is identified in the UI rather than repeated as a primary scene card.
3. Folders and files are visually distinct. Selecting and opening a folder moves into it with a comprehensible camera transition; breadcrumbs and Back return through the hierarchy.
4. The same core browsing flow works on macOS, Windows, and Linux using native filesystem paths.
5. Standard local sidebar shortcuts open real OS locations (Home, Desktop, Documents, Downloads, and available media folders); unavailable locations are omitted.

Use one active directory at a time and a bounded number of visible objects. Fetch only the active directory and its direct children for MVP-0; never recursively index the selected root. Use deterministic placement and a small set of file-type icons. Add bounded camera zoom so users can inspect nearer cards or reveal more of the already-loaded depth field without triggering filesystem reads. Include a directory picker, standard local location shortcuts, and fixture content so the concept can be evaluated quickly.

### Explicitly out of scope for MVP-0

- Full replacement for Finder/File Explorer, file opening/previewing, file editing, destructive file operations, trash management, or bulk operations.
- Multi-pane browsing, tabs, saved workspaces, cloud providers, network mounts as a special feature, indexing, global search, tagging, previews for every format, and synchronization.
- Background filesystem watchers, a plugin system, custom scripting, collaboration, telemetry, and elaborate account or settings systems.
- A physically simulated world, arbitrary freeform layout editing, or GPU-specific rendering features.

These can be considered after the spatial navigation loop has been tested with real folders.

---

## 2. Recommended stack

| Area | Choice | Reason |
|---|---|---|
| Desktop shell | **Tauri 2** | Small native host, Rust backend, explicit capability model, and suitable cross-platform packaging. |
| UI | **React + TypeScript + Vite** | Familiar component model for chrome, panels, breadcrumbs, and accessible controls; TypeScript makes the renderer boundary explicit. |
| 3D | **Three.js** with `@react-three/fiber` and `@react-three/drei` where useful | Three.js has a broad ecosystem and flexible rendering; R3F lets scene composition follow React without requiring all state to live in React. Keep the scene implementation replaceable behind a renderer-facing interface. |
| Native and filesystem access | **Rust commands in Tauri** | Native paths, metadata, directory enumeration, and OS file-opening behavior belong behind a narrow native boundary. |
| Validation | TypeScript schemas at IPC boundary; Rust types and tests in backend | Catch invalid or stale payloads on both sides. Choose a lightweight schema library such as Zod only if the frontend already uses it. |
| Package manager | pnpm (unless repository already standardizes another) | Fast workspace installs and clear package boundaries. |

Do not add Redux, a database, a worker pool, WebGPU, or an elaborate dependency-injection framework for MVP-0. React state plus a small external store is sufficient. Tauri is recommended over Electron because the product needs local filesystem access and a restrained native shell; Electron remains a fallback if a future requirement needs Node ecosystem APIs unavailable or impractical through Tauri.

Three.js is the initial renderer, not a product-level commitment to expose Three.js types throughout the app. Keep domain and layout code free of Three.js classes so render technology can change without rewriting filesystem logic.

---

## 3. Architecture at a glance

```text
┌────────────────────── React application ──────────────────────┐
│ App shell / toolbar / breadcrumbs / details panel / dialogs   │
│                 App state + navigation controller              │
│                           │                                     │
│                 Spatial scene view                              │
│                 picking → domain actions                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ typed IPC adapter
┌───────────────────────────▼─────────────────────────────────────┐
│ Tauri Rust commands: list directory, stat entry, open with OS   │
│ path validation, error mapping, platform adapters               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                      Local filesystem

Directory snapshot → normalized FileNode records → scene projection
                   → pure spatial layout → renderer objects
```

### Layer responsibilities

1. **Platform/filesystem adapter (Rust):** Access OS facilities and convert platform-specific results into stable DTOs. Never implement visual or navigation policy here.
2. **Application/domain layer (TypeScript):** Define normalized records, navigation rules, selection, sorting, error states, and user actions. It should not depend on React, Tauri APIs, or Three.js.
3. **Scene/layout layer (TypeScript):** Project the current directory snapshot into a deterministic set of visual items and positions. Pure inputs and outputs make it straightforward to test.
4. **Renderer (Three.js/R3F):** Draw scene items, manage camera and visual effects, and turn pointer/keyboard events into semantic item identifiers. It must not enumerate the filesystem or own authoritative app state.
5. **UI shell (React):** Present controls, status, metadata, dialogs, and accessible alternatives to scene actions.

The principal data flow is one-way: filesystem snapshot → FileNode DTOs → application state → scene projection/layout → rendered objects. User input returns as semantic actions (`openFolder(id)`, `select(id)`, `goBack()`), not mutations to scene objects.

---

## 4. Normalized filesystem model

Treat the filesystem as the source of truth. The UI holds snapshots, not a second mutable filesystem. MVP-0 lists only the current directory and loads a child directory on demand.

```ts
type EntryKind = "directory" | "file" | "symlink" | "other";

interface FileNode {
  /** Stable for the lifetime of this snapshot; opaque to UI consumers. */
  id: string;
  /** Native path serialized as a string by the backend. Do not parse in UI. */
  path: string;
  parentId: string | null;
  name: string;
  kind: EntryKind;
  extension: string | null; // lowercase, without leading dot; null for none
  sizeBytes: number | null; // null for directories or unavailable metadata
  modifiedAt: string | null; // RFC 3339 UTC timestamp
  hidden: boolean;
  isSymlink: boolean;
  /** Link target when safely available; never follow automatically. */
  symlinkTarget: string | null;
  capabilities: {
    canRead: boolean;
    canEnter: boolean;
    canOpen: boolean;
  };
}

interface DirectorySnapshot {
  directory: FileNode;
  children: FileNode[];
  loadedAt: string;
  truncated: boolean;
  nextPageToken: string | null;
}
```

### Identity, paths, and ordering

- `id` is opaque. For MVP-0, derive it from a normalized native path within the current session or mint a snapshot-scoped ID. Do not promise stable identity across rename/restart; canonical file identity differs by OS and filesystem.
- Preserve the native path string unchanged after receipt. The frontend must not join path segments or assume `/` separators.
- The backend returns a sorted list: directories first, then case-insensitive name order with a stable tie-break. Keep sorting policy in one place and document it.
- Paths may contain non-UTF-8 bytes on Unix. The first implementation may return a structured `UnsupportedPathEncoding` error for paths that cannot be represented in the transport; do not silently replace bytes. Record this as a compatibility limitation for later design.
- Size and timestamps are nullable because permissions, virtual files, and platform metadata can make them unavailable.

### Symlink policy

Display symlinks distinctly and do not follow them during enumeration. Entering a directory symlink should be an explicit, tested behavior. For MVP-0, prefer not entering symlinked directories until traversal-loop and boundary behavior is defined. Never recursively scan.

---

## 5. Filesystem API and platform adapters

Expose a small command surface through one frontend adapter module. Avoid direct `invoke()` calls in components.

```ts
interface FilesystemPort {
  openDefaultDirectory(): Promise<DirectorySnapshot>;
  listSidebarLocations(): Promise<SidebarLocation[]>;
  openSidebarLocation(id: string): Promise<DirectorySnapshot>;
  chooseRoot(): Promise<DirectorySnapshot | null>;
  listDirectory(path: string, options?: { limit?: number; cursor?: string }): Promise<DirectorySnapshot>;
  previewTextFile(path: string): Promise<{ text: string; truncated: boolean }>;
  createDirectory(parentPath: string, name: string): Promise<DirectorySnapshot>;
  renameEntry(path: string, name: string): Promise<DirectorySnapshot>;
}
```

Use serializable DTOs and stable error codes; map backend errors into user-facing categories such as `NotFound`, `PermissionDenied`, `NotDirectory`, `UnsupportedPathEncoding`, `TooManyEntries`, and `Unknown`.

### MVP-0 command contract in the current scaffold

- `open_default_directory` opens the user's Home directory on launch, canonicalizes it, and sets it as the session root.
- `list_sidebar_locations` resolves standard local locations through Tauri's platform path resolver, filters missing directories, and removes canonical duplicates. `open_sidebar_location({ id })` accepts only a known location ID, lists that directory, and then makes it the session root. The frontend never supplies an arbitrary path for this action.
- `choose_root` opens the native folder picker only when the user asks to switch roots, canonicalizes and lists the selected directory, and only then makes it the session root. A failed listing leaves the prior root intact.
- `list_directory({ path })` returns that directory and its direct children only. The backend rejects paths outside the selected root and paths that traverse symlinks, sorts directories first, and caps results at 300 with `truncated: true`.
- Stage 2 `preview_text_file({ path })` is a deliberately narrow read capability. It accepts only a regular file inside the selected root, rejects symlink traversal, allows a small explicit text-extension set, reads at most 64 KiB, and returns UTF-8 text plus a truncation flag. It does not accept arbitrary read lengths, decode other formats, or expose a generic file-read command.
- Stage 3 `create_directory({ parentPath, name })` creates one child directory only. It resolves the parent inside the selected root, rejects symlink traversal, invalid path-like names, and collisions, then returns a fresh snapshot. Do not expose arbitrary write paths or recursive creation through this command.
- Stage 3 `rename_entry({ path, name })` renames one selected file or directory in its existing parent. It rejects root renames, symlink traversal, invalid names, and existing destinations, then returns a fresh parent snapshot. Keep the operation scoped to the selected root; do not turn it into a move command.
- The current Rust DTO is intentionally the MVP subset of the conceptual model above: it includes `id`, opaque `path`, `parentId`, `name`, `kind`, `extension`, `sizeBytes`, `modifiedAt`, `hidden`, and `isSymlink`. It does not yet return capabilities, symlink targets, or a paging token.
- Errors currently cross IPC as stable string codes (`NOT_FOUND`, `PERMISSION_DENIED`, `NOT_DIRECTORY`, `UNSUPPORTED_PATH_ENCODING`, `ROOT_NOT_SELECTED`, `OUTSIDE_SELECTED_ROOT`, `FILESYSTEM_ERROR`) and are mapped to short UI messages. Replace with a structured envelope if additional recovery actions are introduced.
- Browser preview uses fixture data because it has no native filesystem capability. The desktop runtime loads Home directly on launch and keeps the folder picker as an explicit root-switch action; the UI does not import filesystem APIs directly.

### Rust backend responsibilities

- Use native filesystem APIs to inspect and enumerate one requested directory.
- Apply a reasonable initial page limit (for example, 300 entries); return truncation/pagination state rather than blocking the UI on unbounded directories.
- Gather only metadata needed for the current screen.
- Return stable, documented errors without leaking internal stack traces to UI.
- Keep platform-specific code in narrow adapter modules (`macos`, `windows`, `linux`) only when behavior actually differs.

### MVP-0 does not need watchers

Refresh the active directory on explicit user action and when re-entering it. Watchers add event coalescing, rename reconciliation, overflow recovery, and lifecycle complexity; add them only when stale views are a demonstrated problem. Keep the `FilesystemPort` boundary so a watcher-backed implementation can be introduced later.

---

## 6. Scene projection and spatial layout

The scene is a spatial projection of one active directory snapshot. Future layouts may include ancestor or sibling context, but MVP-0 shows the active directory's direct children as its primary scene contents. It is not a recursively loaded copy of the disk. The scene remains useful with only the active directory and its immediate children.

```ts
interface SceneItem {
  nodeId: string;
  role: "folder" | "file" | "ancestor" | "overflow";
  position: [number, number, number];
  scale: number;
  label: string;
  visualState: "normal" | "selected" | "focused" | "disabled";
}

interface SceneProjection {
  items: SceneItem[];
  cameraTarget: [number, number, number];
  bounds: { width: number; height: number; depth: number };
}
```

### MVP layout rules

- Identify the active directory through breadcrumbs and the details dock; do not spend the primary scene on a redundant card for the already-open directory.
- Arrange direct children as the primary interactive objects, with a readable foreground row and smaller receding rows. Give folders translucent cards and files a visually distinct representation.
- Keep ancestor/sibling context out of MVP-0's primary view unless real directory data can be shown without confusing it with active contents. Never fabricate context entries.
- Do not recursively traverse. The layout works from the active directory snapshot only.
- Use deterministic placement based on sorted child order and stable scene rules. The same input should produce the same layout.
- Cap detailed rendered entries (initial target: 32 in the 3D field). Keep all loaded entries available through the accessible list and show a clear indication when scene items are capped; do not create thousands of expensive objects.
- Normalize depth and scale around the active directory. Do not map the full absolute filesystem depth to unbounded camera distance.
- Keep filesystem records separate from layout output. Layout is a pure function: `(sceneInput, layoutOptions) → SceneProjection`.

Later layout experiments may introduce clustering or user-controlled arrangement behind a `LayoutStrategy` interface. MVP-0 should implement one strategy only.

---

## 7. Rendering, camera, and interaction

### Renderer

- Use a single WebGL canvas for the 3D viewport; DOM-based React components provide menus, breadcrumbs, status, and metadata panels.
- Represent repeated cards/icons with shared geometry/materials where practical. Avoid one expensive post-processing chain for every frame.
- Ensure a 2D accessible list or equivalent selectable view exists for keyboard operation, reduced-motion settings, and renderer failure.
- The renderer receives `SceneProjection` and emits item IDs. It does not call filesystem APIs.

### Camera and navigation

- Use a perspective camera with bounded-pitch orbit and a stable visual anchor on the active directory. Motion should feel like traveling through filesystem space, not like a game camera; avoid movement that makes orientation unclear.
- Support bounded trackpad pinch zoom from 72% to 160%, with modified-wheel and visible button alternatives. Zoom changes camera distance and reveals more of the already-loaded depth field; it does not request or enumerate more files.
- Map two-axis trackpad scrolling and primary-button mouse drag to damped camera yaw and pitch around the spatial field. Yaw supports continuous full revolutions; clamp pitch before the camera flips. Diagonal input changes both axes. Cards face the camera during orbit so labels remain readable from every yaw angle. Rotation must not pan the filesystem, change selection, or request directory data.
- Use accessible Deeper/Entrance controls to dolly through loaded depth rows. Clamp travel to the current scene's projected depth so rotation does not move the camera into empty space; keep selection and filesystem state unchanged.
- Reset zoom, yaw, pitch, and depth framing when the active directory changes. Provide a Reset view button within a directory and keep Back/breadcrumb navigation independent of camera controls.
- Opening a folder: request its snapshot, show loading feedback, then move the scene through depth as the new directory's contents arrive from farther back. Target the spec's initial 200–600 ms transition range and tune through use. If loading fails, retain the current directory and show an actionable error.
- Back/breadcrumb: reverse the spatial transition and restore the prior scene from a small in-memory navigation stack when available; otherwise fetch it again. Do not rely on camera history as navigation state.
- Use short, interruptible transitions; respect `prefers-reduced-motion` and provide a no-animation mode.
- Click/tap selects. A second activation or Enter opens a folder. File preview/open behavior is deferred. Escape clears transient selection or closes an overlay. Keyboard focus order remains in DOM controls and the accessible item list. Zoom must also be operable without a trackpad gesture.

### Picking and accessibility

Resolve raycast hits to `nodeId`, then dispatch a semantic action. Maintain a consistent mapping between rendered item and DOM accessibility representation. Labels should include name and kind; metadata should be available without color alone. Provide visible focus and selection states.

---

## 8. State management

Use React for presentation state and a small typed application store (Context/reducer is enough initially; Zustand is acceptable if cross-component coordination becomes awkward). Avoid duplicating values.

```text
App state
├── activePath / activeDirectoryId
├── directoryCache[path] → DirectorySnapshot
├── navigationStack[path]
├── selectedNodeId
├── focusedNodeId
├── loadingState + lastError
├── layoutOptions
└── user preferences (minimal: motion, hidden files)
```

- Cache only visited directory snapshots during a session; clear or refresh on explicit reload.
- Derive breadcrumbs, visible entries, and scene projection rather than storing duplicates.
- Keep transient renderer state (hover, animation progress, camera interpolation) inside the viewport layer, keyed from app intent where needed.
- Model async requests with request IDs or active-path checks so a slow response from a prior navigation cannot replace the current directory.
- Persist no state to disk in MVP-0 except settings only if required to make the demo usable.

---

## 9. Performance and resilience

Target smooth interaction on an ordinary integrated-GPU laptop for a directory of a few hundred entries. Treat this as an initial validation target, not a benchmark guarantee.

- Load only the active directory and its direct children in MVP-0. Camera zoom only changes the view of already-loaded items and never triggers filesystem enumeration. Never recursively walk the selected root.
- Paginate or cap large directories and make truncation visible.
- Fetch minimal metadata; avoid thumbnails and content sniffing in MVP-0.
- Use instancing or shared resources if profiling shows object count or draw calls are limiting.
- Avoid unnecessary React rerenders from pointer movement; keep hover and animation updates local to the renderer.
- Dispose of geometries, materials, textures, event listeners, and renderer resources on unmount/navigation.
- Handle WebGL unavailable/context loss with a readable error and accessible list fallback.
- Show loading, empty-directory, permission-denied, unavailable-path, and partial-results states.
- Profile representative folders before adding virtualization inside the 3D scene; the first safeguard is a bounded visible set.

---

## 10. Cross-platform and security boundaries

### Cross-platform

- Keep OS path handling in Rust and treat the path as opaque in TypeScript.
- Use Tauri's native directory picker where available, through the same `FilesystemPort` interface.
- Verify default-file opening behavior per OS. Do not shell-interpolate user-controlled paths.
- Test case sensitivity, hidden files, permissions, symlinks, Unicode names, removable volumes, and missing paths on macOS, Windows, and Linux.
- Avoid assumptions about drive letters, mount roots, path separators, or POSIX permissions in UI code.

### Security

- Renderer code is untrusted input from the perspective of the native backend. Every command validates arguments and permissions before touching a path.
- Grant the webview only the Tauri capabilities/plugins required by the MVP. Do not expose arbitrary shell execution or unrestricted filesystem APIs to frontend code.
- Use scoped command methods for listing and opening; do not accept generic read/write/delete operations.
- Text preview is limited to an allowlist (`txt`, `md`, `markdown`, `json`, `csv`, `log`, `yaml`, `yml`, `toml`, `xml`, `html`, `css`, `js`, `jsx`, `ts`, `tsx`, `rs`) and 64 KiB per request. Reject non-UTF-8 content and non-regular files; display preview contents as escaped plain text.
- Treat names, paths, metadata, and file contents as untrusted data. Render names as text; never inject as HTML.
- Do not follow symlinks implicitly or traverse beyond the user-selected scope as a background task.
- Avoid logging full user paths or filenames unless necessary for local debugging; do not add telemetry in MVP-0.
- Keep CSP restrictive and dependencies limited. Review any plugin that expands native capability.

The user-selected directory is a navigation starting point, not an authorization mechanism by itself. The backend must still handle permission failures and path races safely.

---

## 11. Repository structure

```text
fileverse/
├── src/                         # React application
│   ├── app/                     # app shell, routes/views, app composition
│   ├── components/              # toolbar, breadcrumbs, details, dialogs
│   ├── features/filesystem/     # FileNode, port, errors, adapters
│   ├── features/navigation/     # controller, stack, commands
│   ├── features/scene/          # projection, layout strategies, types
│   ├── features/viewport/       # Three.js/R3F renderer and interactions
│   ├── state/                   # app store and selectors
│   └── styles/
├── src-tauri/
│   ├── src/                     # commands, DTOs, platform adapters
│   ├── capabilities/            # minimal Tauri permissions
│   └── tauri.conf.json
├── tests/                       # integration/e2e tests when added
├── docs/                        # architecture decisions and user notes
├── FileVerse_PROJECT_SPEC.md
├── ARCHITECTURE.md
└── README.md
```

Keep the frontend domain modules independent of the exact filesystem transport so unit tests can inject a fake `FilesystemPort`. Avoid splitting into multiple packages until code ownership or build constraints justify it.

---

## 12. Testing strategy

Testing is focused on risk and behavior, not broad infrastructure.

- **Rust unit tests:** cover empty, missing, permission-denied, Unicode and hidden names, symlink classification/non-entry, root-boundary rejection, non-UTF-8 path errors, directory ordering, and the 300-entry truncation cap. These checks exercise isolated temporary fixtures and do not read or modify project/user folders.
- **TypeScript unit tests:** FileNode normalization assumptions, navigation stack, stale-response handling, and deterministic scene layout.
- **Component checks:** breadcrumbs, selection/details state, loading/error/empty states, accessible list and keyboard behavior.
- **Manual platform smoke test:** choose a directory, navigate into and back from a folder, select an entry, and validate the OS picker, Unicode and hidden names, and permission/missing-path behavior on each target OS. Rust fixtures do not replace native OS permission, picker, or cross-platform checks.
- **E2E automation:** add only after the first working vertical slice; automate the core open-folder/back flow using a fixed fixture directory. Keep native file picker behavior covered by manual or platform-specific checks if automation is brittle.

Do not add a large testing stack before the project exists. Start with the framework defaults, pure-function tests, and a short reproducible smoke-test checklist. CI should at minimum build the frontend and compile/check the Rust application on supported runners once CI is introduced.

---

## 13. AI-agent collaboration rules

1. **Read first:** Before implementation, read `FileVerse_PROJECT_SPEC.md`, this document, repository `README.md`, and any `AGENTS.md` instructions. Treat the spec as product truth and this file as technical direction.
2. **Small vertical slices:** Implement a runnable app shell, then directory listing, then scene projection/rendering, then navigation interactions. Keep each change reviewable.
3. **Ownership boundaries:** Filesystem/backend work owns Rust commands and DTO contract; scene work owns pure projection/layout and viewport rendering; integration work owns app state and cross-layer wiring. One agent should coordinate the API shape before parallel edits to shared types.
4. **No silent architecture changes:** If a change affects the stack, IPC contract, FileNode semantics, security boundary, or navigation model, explain the reason and update this document or add a short decision record in `docs/decisions/` in the same change.
5. **Use branches and review:** Work on focused branches or isolated worktrees when parallelizing. Review diffs for unexpected scope, native permissions, dependency additions, and generated files before merge.
6. **Keep MVP small:** Do not implement roadmap features because they seem obvious. Check every feature against the MVP-0 proof goals above.
7. **Report evidence:** Summarize user-visible behavior, files changed, manual checks/build checks actually performed, known limitations, and any architecture decisions needing product input. Never claim tests passed unless they were run.
8. **Protect user data:** Avoid destructive filesystem actions in development fixtures and never run broad cleanup commands against user-selected directories.

Suggested future agent split, when parallel implementation is useful:

- **Coordinator:** owns integration, interfaces, and product-scope decisions.
- **Native/filesystem:** Rust listing, metadata, error model, and platform smoke checks.
- **Spatial UI:** React shell, scene layout, renderer, and accessibility fallback.
- **Reviewer:** challenges security, cross-platform assumptions, performance risks, and spec alignment; reviewer does not broaden scope without evidence.

For MVP-0, a single agent may be faster and safer until the interfaces stabilize.

---

## 14. Milestone sequence

1. **Scaffold:** Tauri + React/TypeScript launches on a desktop; show placeholder scene and basic controls.
2. **Filesystem vertical slice:** open Home by default or choose another root, list one level, normalize DTOs, show errors and empty state.
3. **Spatial proof:** deterministic layout and folder/file rendering for a fixture directory; selection and details.
4. **Navigation proof:** open folder, breadcrumb/back, transition, and stale-request protection.
5. **Spatial controls validation:** verify trackpad pinch, two-axis orbit, mouse-drag orbit, and depth controls in the Tauri desktop app. Confirm camera controls reveal the loaded scene without loading additional filesystem entries and reset on folder navigation.
6. **Concept review:** try with representative real directories on all target operating systems; record usability and performance findings before adding roadmap features.

### Acceptance checklist for MVP-0

- [ ] Launch into Home and choose another directory on each supported OS.
- [ ] Current directory children appear in a readable 3D spatial view.
- [ ] Folder and file visuals are distinguishable; selection is visible and keyboard-accessible.
- [ ] Open folder, navigate back, and use breadcrumbs without losing orientation.
- [ ] Pinch zoom in/out on a trackpad; use an accessible alternative and reset the view. Zoom reveals loaded depth without triggering additional filesystem reads.
- [ ] Two-axis trackpad scrolling and mouse drag orbit through a full yaw revolution, tilt within safe pitch limits, and do not change directory selection; Reset restores the default orientation.
- [ ] Accessible depth controls move progressively through loaded rows, clamp at scene depth, and do not scan or change selection.
- [ ] Empty, large, missing, and permission-denied directories fail gracefully.
- [x] Available Home, Desktop, Documents, Downloads, and common media shortcuts open the corresponding real directory; missing locations are omitted and shortcut navigation resets the current-root boundary safely. (User-verified in the desktop app.)
- [ ] A 300-entry directory remains responsive or visibly truncates/paginates.
- [ ] No recursive traversal, implicit symlink traversal, or unnecessary native permissions.

---

## 15. Open decisions to validate during implementation

- Confirm the exact visual interpretation of the supplied design images: whether ancestor folders are rendered in depth, and how files share the space with folder cards.
- Decide how to represent non-UTF-8 Unix paths if such paths must be supported in the first public release.
- Confirm the product's intended behavior for entering directory symlinks.
- Tune entry cap, card density, transition duration, and reduced-motion defaults through real-device use.
- Revisit watcher support only if manual refresh and navigation-time refresh prove insufficient.

These are implementation validation items, not blockers to beginning the MVP-0 vertical slice.
