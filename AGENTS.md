# FileVerse Agent Instructions

These instructions apply to all AI agents working in this repository. They supplement the product and technical source documents; they do not replace them.

## Source of truth and decision order

Before making a significant change, read:

1. `FileVerse_PROJECT_SPEC.md` for product intent, MVP boundary, and visual direction.
2. `ARCHITECTURE.md` for the selected stack, layer boundaries, data contracts, security rules, and milestone sequence.
3. This file and any more specific `AGENTS.md` in the target subdirectory.

When documents appear to conflict, follow the product spec for user-visible goals and MVP scope, and follow the architecture for technical decisions. If the conflict is material, stop before implementing the conflicting behavior, explain the conflict, and propose a small documentation update. Do not silently redefine the product or architecture.

## Product guardrails

- FileVerse is a practical file browser whose filesystem hierarchy is represented spatially. The 3D view must communicate location and hierarchy; it is not decoration or a game environment.
- Keep the open directory's contents visually dominant in the scene. Identify the active directory through breadcrumbs and the details dock; do not spend the primary scene on a card for a directory that is already open.
- Preserve familiar navigation controls, especially breadcrumbs and Back. Do not make 3D gestures the only way to navigate.
- Build only the current milestone. MVP-0 is for proving directory access, normalized filesystem data, a contents-first spatial layout, selection, folder navigation, camera transitions, bounded spatial zoom, full-yaw orbit from two-axis trackpad scrolling or mouse drag, safe pitch limits, and accessible travel through loaded depth rows.
- Do not add roadmap features such as search, cloud providers, file operations, previews, watchers, tagging, sync, or plugins unless the user explicitly brings them into scope.
- Keep visual effects restrained and preserve clarity, performance, and accessibility.

## Architecture boundaries

- Use the approved baseline: Tauri 2, React, TypeScript, Three.js (R3F where useful), and Rust for OS/filesystem access. Do not replace these technologies without recording a concrete reason and updating `ARCHITECTURE.md`.
- Keep filesystem access in Rust behind narrow Tauri commands. Never access the OS filesystem directly from renderer components.
- Keep normalized domain types and navigation policy independent of React, Tauri, and Three.js.
- Keep spatial projection and layout deterministic and independent of filesystem access. The renderer receives a scene projection and emits semantic IDs/actions; it must not read directories or own the authoritative application state.
- Keep platform-specific path and filesystem behavior inside Rust/platform adapters. Treat paths as opaque strings in the frontend.
- Use typed, serializable IPC DTOs and map backend errors to stable user-facing categories.
- Enumerate lazily and only as much as the current scene needs. Do not recursively scan a user-selected directory.
- Do not follow symlinks implicitly. Do not add generic shell, read, write, delete, or arbitrary path capabilities to the webview.
- Keep Tauri permissions, plugins, and CSP as narrow as the feature allows. Treat filenames, metadata, and paths as untrusted text.

## Implementation workflow

- Make the smallest coherent change that produces a runnable, reviewable increment.
- Prefer vertical slices that connect UI, domain behavior, and backend only where needed. Keep interfaces explicit before parallel implementation.
- Preserve existing project conventions once the app scaffold exists. Avoid adding dependencies for functionality already available in the stack.
- Do not create extra abstractions, packages, or infrastructure without a current use case.
- Keep generated files, build outputs, local machine configuration, and unrelated user content out of commits.
- Do not perform destructive actions on user data or directories. Use isolated fixtures for filesystem examples.
- Update `ARCHITECTURE.md` or add a short decision record under `docs/decisions/` when changing the stack, IPC contract, FileNode semantics, security boundary, or navigation model.
- Keep documentation and code aligned when a user-visible behavior or interface changes.

## Testing and verification

- Select checks that directly cover the change. Start with focused unit or component checks and build/type checks appropriate to the existing project setup.
- For filesystem behavior, cover permission errors, missing paths, hidden names, Unicode names, symlink classification, and large-directory truncation where relevant.
- For spatial behavior, verify deterministic layout, selection/focus states, navigation transitions, stale async responses, and reduced-motion behavior where relevant.
- Do not claim a check passed unless it was actually run. Report commands/checks performed and any known limitations.
- Do not introduce a large testing framework before the app scaffold and first vertical slice justify it.

## Collaboration and review

- The coordinator or primary agent owns cross-layer integration, shared contracts, and scope decisions.
- Backend/filesystem work owns Rust commands, DTO conversion, error mapping, and platform-specific behavior.
- Spatial UI work owns React presentation, pure layout/projection, renderer behavior, and accessibility fallback.
- Review work challenges alignment with the spec, security, cross-platform assumptions, performance, and maintainability; it should not silently broaden scope.
- Before parallel work, agree on file ownership and shared interfaces. Avoid multiple agents editing the same contract or integration point at once.
- Use focused branches or isolated worktrees for parallel changes when available. Review the resulting diff for scope, security permissions, dependency changes, and accidental generated files.
- Every handoff should state what changed, what was verified, what remains uncertain, and whether a documented decision changed.

## Communication expectations

When reporting work, summarize:

1. The user-visible behavior or document change.
2. The main files changed.
3. Checks actually performed.
4. Known limitations or unresolved product decisions.

Ask for product input only when a decision changes intended user behavior or cannot be resolved from `FileVerse_PROJECT_SPEC.md` and `ARCHITECTURE.md`. Resolve routine implementation choices independently and record significant decisions.
