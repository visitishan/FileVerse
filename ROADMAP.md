# FileVerse Roadmap

> A milestone-based plan for turning the FileVerse concept into a useful spatial file browser. Milestones are ordered by dependency and validation value; dates are intentionally omitted until the first runnable prototype gives us realistic estimates.

**Product source:** `FileVerse_PROJECT_SPEC.md`  
**Technical direction:** `ARCHITECTURE.md`  
**Agent rules:** `AGENTS.md`

---

## Roadmap principles

- Prove the spatial browsing loop before building a complete file manager.
- Keep every milestone runnable and reviewable.
- Validate the idea with real directories and users before investing in advanced features.
- Let filesystem hierarchy drive spatial layout; visual effects must preserve clarity and performance.
- Build with cross-platform boundaries from the start, but make platform-support claims only after testing on those platforms.
- Add production features only when a demonstrated user need or a milestone's acceptance criteria requires them.

## At a glance

| Stage | Outcome | State |
|---|---|---|
| 0. Project foundation | Product, architecture, and agent guidance are documented | Complete: specification, architecture, contributor rules, roadmap, and native smoke checklist are present |
| 1. MVP-0 spatial prototype | See a folder's actual contents in depth, navigate into folders/back, zoom, orbit, and travel through loaded depth rows | Complete on macOS: native fixture checks and user-confirmed horizontal/diagonal trackpad gestures passed; Windows/Linux remain deferred to Stage 4 |
| 2. File manager basics | Make browsing useful for everyday discovery | In progress: search and sorting are native-checked; bounded plain-text preview displays in the native app; edge-case checks remain |
| 3. File operations | Safely perform common local file actions | After browsing behavior stabilizes |
| 4. Platform completion | Verify and adapt behavior for macOS, Windows, and Linux | Incremental, with dedicated hardening stage |
| 5. Additional storage | Explore network and cloud locations through adapters | Only after local filesystem experience is solid |
| 6. Advanced intelligence | Add smart organization and search where evidence supports it | Long-term exploration |

---

## MVP-0 progress tracker

This is the repository's working checklist for contributor handoff. Update a row only when its implementation or verification evidence changes. The detailed pass/fail log for native behavior lives in [`docs/MVP0_NATIVE_SMOKE_CHECKLIST.md`](docs/MVP0_NATIVE_SMOKE_CHECKLIST.md).

| Work area | Implementation | Verification / next action |
|---|---|---|
| Product and technical foundation | Complete | Spec, architecture, contributor rules, and roadmap agree on the MVP-0 boundary |
| Tauri + React/TypeScript + Three.js application | Implemented | `npm run build` passes; run on the target desktop OS before release |
| Rust local filesystem adapter and normalized entries | Implemented; all 9 fixture tests pass for empty, missing, restricted, Unicode, symlink, root-boundary, and large directories | Native UI checks also passed for empty, Unicode/hidden names, restricted folder, symlink, and 301-entry truncation |
| Home startup, common local sidebar locations, folder open/back, and breadcrumbs | Implemented | User-confirmed in the desktop app; picker selection and cancel are also reported working; permission and selected-root boundary checks passed in the native app |
| Spatial cards and folder-entry transition | Implemented | Manually verified during MVP-0 use; continue to assess readability with representative directories |
| Zoom, orbit, and loaded-depth controls | Implemented; horizontal scroll orbits around the loaded-stack center, vertical scroll travels through depth, and mouse drag controls yaw/pitch | User-confirmed: horizontal and diagonal trackpad gestures work; vertical scroll and mouse drag leave the active folder unchanged |
| macOS native behavior | Complete for Stage 1 | Native fixture checks and user-confirmed physical trackpad gestures are recorded in [`docs/MVP0_NATIVE_SMOKE_CHECKLIST.md`](docs/MVP0_NATIVE_SMOKE_CHECKLIST.md) |
| Windows and Linux behavior | Deferred to Stage 4 | No Windows/Linux machine is currently available; do not claim platform support until checked |
| Stage 2 features | In progress | Search/sorting are native-checked; previewing README.md works in the native app. Verify truncation and unsupported/binary rejection. Keep file operations, cloud storage, and watchers deferred |

**Where to continue:** finish the bounded plain-text preview checks in [`docs/STAGE2_NATIVE_CHECKLIST.md`](docs/STAGE2_NATIVE_CHECKLIST.md): verify 64 KiB truncation and unsupported/binary rejection. A real UTF-8 Markdown file preview was confirmed in the native app. Current-folder filename search was native-checked for shortcut focus, positive match, and no-match behavior; sorting was native-checked for recently modified, largest first, and name order. Stage 1's macOS checks are complete based on native fixture verification and the user's physical horizontal/diagonal trackpad confirmation. Windows/Linux checks stay deferred to Stage 4.

---

## Stage 0 — Project foundation

### Purpose

Keep a shared product and technical reference so implementation work does not begin with conflicting assumptions.

### Deliverables

- `FileVerse_PROJECT_SPEC.md`: product vision, spatial design, MVP definition, and future direction.
- `ARCHITECTURE.md`: stack, data flow, filesystem model, rendering, security, performance, and testing.
- `AGENTS.md`: rules for AI agents and contributors working in the repository.
- `ROADMAP.md`: this milestone plan.
- Preserve the supplied visual reference images in the project for design review.

### Exit criteria

- The four project documents agree on the first prototype's purpose and boundaries.
- The team can describe the first vertical slice in a few concrete user actions.

---

## Stage 1 — MVP-0: 3D filesystem prototype

### Goal

Prove that users can understand and navigate a real directory more intuitively when filesystem hierarchy is represented as spatial depth.

### Scope

1. Create a Tauri + React/TypeScript + Three.js desktop shell.
2. Open the user's Home directory at launch, provide working shortcuts to available OS locations (Home, Desktop, Documents, Downloads, and common media folders), and let them choose another local root on demand.
3. Read one directory at a time through a narrow Rust filesystem adapter and normalize entries into `FileNode` records.
4. Build a deterministic, contents-first scene projection: identify the open directory in breadcrumbs/details and arrange its direct files and subfolders as the primary cards.
5. Render translucent folder cards, file representations, restrained lighting, and depth cues inspired by the reference images.
6. Support selection, opening a folder, Back, and breadcrumb navigation.
7. Animate folder navigation as a short spatial camera transition; preserve orientation and respect reduced-motion preferences.
8. Add bounded trackpad pinch zoom up to 160%, centered full-yaw orbit by horizontal scroll or mouse drag, and vertical-scroll dolly through loaded depth rows; provide reset-to-default. Camera gestures must not trigger filesystem reads.
9. Show loading, empty, permission-denied, unavailable-path, and large-directory states.

### Explicitly deferred

Search, thumbnails, general file previews, file operations, cloud/network storage, filesystem watchers, recursive indexing, and elaborate settings.

### Acceptance criteria

- Launch the desktop app and see a real directory immediately; change the root through an explicit folder-picker action.
- Understand which directory is current and see folder hierarchy represented through position/depth.
- See the current directory's files and subfolders clearly, without a redundant open-folder card taking the primary scene.
- Distinguish folders from files and select entries with visible focus/selection.
- Open a folder and return using Back or a breadcrumb without losing orientation.
- Zoom from 72% to 160%, use the accessible controls, and reset the view; zoom reveals loaded depth without scanning more files.
- Orbit through full yaw revolutions with horizontal/diagonal trackpad scroll or mouse drag; pitch stays within safe limits, selection does not change, and Reset restores the default view.
- Move forward/back through loaded rows with accessible depth controls; travel stops at scene depth, does not change selection or scan more files, and Reset restores the default view.
- Navigate a directory with hundreds of entries without freezing; excess detail is capped or paginated visibly.
- Handle empty, missing, and permission-denied directories without crashing.
- Open each available local sidebar location and show its real contents; omit locations that do not exist on the current OS.
- Core domain and layout logic can be exercised without a running native filesystem command.

### Review gate

Try the prototype with several representative directories. Record whether users can answer: “Where am I?”, “What is nearby?”, and “How do I go deeper or back?” Review visual density, text readability, camera movement, and performance. Decide whether to refine the spatial model before adding features.

---

## Stage 2 — File manager basics

### Goal

Make the spatial browser practical for finding and inspecting files while keeping 3D navigation central.

### Candidate scope

- Sorting and filtering the current directory.
- Filename and folder-name search with a clearly defined search scope.
- Preview panel for a limited set of safe, common file types.
- Thumbnails loaded lazily and only when visible.
- Context menu and drag-and-drop only after interaction patterns are validated.
- User-managed favorites beyond the standard OS-provided local sidebar locations in MVP-0.

### Exit criteria

- A user can locate a known file in a moderately large directory without relying solely on spatial placement.
- Preview and thumbnail work does not block directory navigation or expose file contents beyond the intended local UI.
- Search and list alternatives remain usable with keyboard and assistive technologies.

### Defer unless user research supports it

Content indexing, semantic/AI search, tagging systems, saved workspaces, and complex configurable layouts.

---

## Stage 3 — Safe local file operations

### Goal

Add common operations only after users trust the navigation and selection model.

### Candidate scope

- Rename, copy, move, and delete with clear confirmation and error handling.
- Undo/recovery strategy where the OS supports it; define behavior before exposing destructive actions.
- Conflict handling for existing destinations and files changing during an operation.
- Refresh and optional filesystem watchers after measuring stale-view problems.
- External/removable volumes and metadata edge cases.

### Exit criteria

- Operations are performed by the native layer with explicit validation and clear success/failure results.
- Destructive actions are deliberate and recoverable where possible.
- Watchers, if added, correctly handle rename bursts, event overflow, and refresh recovery.

---

## Stage 4 — Cross-platform completion

### Goal

Deliver consistent local browsing on macOS, Windows, and Linux while preserving expected platform behavior.

### Strategy

- Keep platform adapters and opaque-path handling in the architecture from the beginning.
- During Stage 1, develop on the available primary platform and run smoke checks on other platforms when practical.
- Before claiming support for a platform, test directory selection, permissions, hidden files, Unicode names, symlinks, removable volumes, default path behavior, and rendering/input performance on that OS.
- Add platform-specific UI adaptations only where they match real OS conventions.
- Document unsupported path encodings and filesystem limitations instead of silently corrupting names.

### Exit criteria

- The same core browsing flow works on each declared supported operating system.
- Platform-specific behavior remains inside adapters or narrowly scoped UI code.
- Build and packaging instructions are reproducible for each supported target.

---

## Stage 5 — Additional storage locations

### Goal

Explore whether the spatial model remains useful beyond local directories.

### Candidate scope

- Network shares and NAS locations.
- Cloud providers such as iCloud Drive, Google Drive, or OneDrive where integration and access model are clear.
- Offline, reconnecting, and partial-availability states.

### Gate before implementation

Choose one storage target based on user demand and validate the provider's authentication, permission, path, and sync semantics. Add it behind a storage adapter; do not make the scene depend on a particular provider.

---

## Stage 6 — Advanced intelligence and visualization

### Candidate explorations

- Smart grouping, storage usage visualization, and timeline views.
- Semantic search or AI-assisted organization.
- Visual relationships between files and folders.

These are experiments, not commitments. Each requires a clear user problem, privacy model, and small prototype before becoming roadmap work.

---

## Immediate next actions

1. Complete the preview edge-case checks in [`docs/STAGE2_NATIVE_CHECKLIST.md`](docs/STAGE2_NATIVE_CHECKLIST.md).
2. Keep search and sorting scoped to already-loaded direct children; do not add recursive traversal or backend filesystem search.
3. Windows/Linux validation remains deferred to Stage 4; retain the MVP-0 native checklist as evidence for macOS behavior.

## Change policy

Update this roadmap when a milestone is completed, reprioritized, or split. Keep completed decisions in architecture/decision records; keep this file focused on outcomes, sequencing, and acceptance criteria. Do not add dates or feature promises without a reasoned estimate and an explicit product decision.
