import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { sampleChildren, sampleSnapshot } from "./data/sampleFilesystem";
import type { DirectorySnapshot, FileNode, SidebarLocation, TextPreview } from "./filesystem/types";
import { isNativeRuntime, tauriFilesystem } from "./filesystem/tauriFilesystem";
import { projectDirectory } from "./scene/SpatialScene";
import { ThreeViewport } from "./scene/ThreeViewport";

const prettyDate = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "—";
const prettySize = (value: number | null) => value === null
  ? "Folder"
  : value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
const previewableExtensions = new Set(["txt", "md", "markdown", "json", "csv", "log", "yaml", "yml", "toml", "xml", "html", "css", "js", "jsx", "ts", "tsx", "rs"]);
const errorMessage = (cause: unknown) => {
  const message = String(cause);
  if (message.includes("PERMISSION_DENIED")) return "FileVerse can’t access this folder. Check its permissions and try again.";
  if (message.includes("NOT_FOUND")) return "This folder is no longer available. Choose another folder.";
  if (message.includes("NOT_DIRECTORY")) return "That location is not a folder.";
  if (message.includes("UNSUPPORTED_PATH_ENCODING")) return "This path contains characters that this platform cannot display.";
  if (message.includes("LOCATION_UNAVAILABLE")) return "That location isn’t available on this device.";
  if (message.includes("PREVIEW_UNSUPPORTED")) return "This file type can’t be previewed yet.";
  if (message.includes("PREVIEW_NOT_UTF8")) return "This file is not valid UTF-8 text and can’t be previewed.";
  if (message.includes("INVALID_NAME")) return "Choose a name without slashes.";
  if (message.includes("ALREADY_EXISTS")) return "An item with that name already exists in this folder.";
  if (message.includes("ROOT_CANNOT_RENAME")) return "Choose an item inside this folder to rename.";
  if (message.includes("NOT_RENAMEABLE")) return "This item can’t be renamed in FileVerse.";
  if (message.includes("OUTSIDE_SELECTED_ROOT")) return "This file is outside the selected folder boundary.";
  if (message.includes("SYMLINK_NOT_ENTERABLE")) return "FileVerse won’t follow symbolic links for this action.";
  if (message.includes("NOT_FILE")) return "That item is not a regular file.";
  if (message.includes("FILESYSTEM_ERROR")) return "FileVerse couldn’t complete this filesystem action.";
  return "This action could not be completed. Please try again.";
};

export default function App() {
  const viewportHost = useRef<HTMLDivElement>(null);
  const viewport = useRef<ThreeViewport | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const createFolderButton = useRef<HTMLButtonElement>(null);
  const folderDialogWasOpen = useRef(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const renameDialogWasOpen = useRef(false);
  const [viewState, setViewState] = useState({ zoom: 1, depth: 0, maxDepth: 0 });
  const zoomLevel = viewState.zoom;
  const [nativeMode] = useState(isNativeRuntime);
  const [sidebarLocations, setSidebarLocations] = useState<SidebarLocation[]>(nativeMode ? [] : [{ id: "home", name: "Home" }]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>("home");
  const initialDirectory: FileNode = nativeMode ? {
    id: "native:choose-root",
    path: "",
    parentId: null,
    name: "Choose a folder to begin",
    kind: "directory",
    extension: null,
    sizeBytes: null,
    modifiedAt: null,
    hidden: false,
    isSymlink: false,
  } : sampleSnapshot.directory;
  const [current, setCurrent] = useState<FileNode>(initialDirectory);
  const [entries, setEntries] = useState<FileNode[]>(nativeMode ? [] : sampleSnapshot.children);
  const [selected, setSelected] = useState<FileNode>(initialDirectory);
  const [stack, setStack] = useState<DirectorySnapshot[]>([]);
  const [hasSelectedRoot, setHasSelectedRoot] = useState(!nativeMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [preview, setPreview] = useState<(TextPreview & { name: string }) | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createFolderBusy, setCreateFolderBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("name-asc");
  const requestId = useRef(0);
  const previewRequestId = useRef(0);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return query ? entries.filter((node) => node.name.toLocaleLowerCase().includes(query)) : entries;
  }, [entries, searchQuery]);
  const displayEntries = useMemo(() => {
    const byName = (a: FileNode, b: FileNode) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    return [...visibleEntries].sort((a, b) => {
      if (sortMode === "name-desc") return byName(b, a);
      if (sortMode === "modified") return (b.modifiedAt ? Date.parse(b.modifiedAt) : -Infinity) - (a.modifiedAt ? Date.parse(a.modifiedAt) : -Infinity) || byName(a, b);
      if (sortMode === "size") return (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1) || byName(a, b);
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return byName(a, b);
    });
  }, [sortMode, visibleEntries]);
  const projection = useMemo(() => projectDirectory(current, displayEntries), [current, displayEntries]);
  const breadcrumbs = useMemo(() => (hasSelectedRoot ? [...stack.map((snapshot) => snapshot.directory), current] : []).map((node, index, nodes) => ({
    name: node.name,
    path: node.path,
    current: index === nodes.length - 1,
  })), [current, hasSelectedRoot, stack]);
  const sceneNodes = displayEntries;
  const selectedItemCount = selected.id === current.id && selected.kind === "directory"
    ? entries.length
    : nativeMode ? 0 : (sampleChildren[selected.id]?.length ?? 0);

  const openNode = async (node: FileNode) => {
    if (node.kind !== "directory" || node.id === current.id) return;
    if (nativeMode) {
      const request = ++requestId.current;
      setBusy(true);
      setError(null);
      try {
        const snapshot = await tauriFilesystem.listDirectory(node.path);
        if (request !== requestId.current) return;
        setStack((items) => [...items, { directory: current, children: entries, loadedAt: new Date().toISOString(), truncated }]);
        setCurrent(snapshot.directory);
        setEntries(snapshot.children);
        setTruncated(snapshot.truncated);
        setSelected(snapshot.directory);
      } catch (cause) {
        if (request === requestId.current) setError(errorMessage(cause));
      } finally {
        if (request === requestId.current) setBusy(false);
      }
      return;
    }
    const children = sampleChildren[node.id] ?? [];
    setStack((items) => [...items, { directory: current, children: entries, loadedAt: new Date().toISOString(), truncated: false }]);
    setCurrent(node);
    setEntries(children);
    setTruncated(false);
    setSelected(node);
  };

  const openSidebarLocation = async (location: SidebarLocation) => {
    if (!nativeMode) {
      setCurrent(sampleSnapshot.directory);
      setEntries(sampleSnapshot.children);
      setTruncated(false);
      setSelected(sampleSnapshot.directory);
      setStack([]);
      setHasSelectedRoot(true);
      setActiveLocationId(location.id);
      return;
    }
    const request = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await tauriFilesystem.openSidebarLocation(location.id);
      if (request !== requestId.current) return;
      setCurrent(snapshot.directory);
      setEntries(snapshot.children);
      setTruncated(snapshot.truncated);
      setSelected(snapshot.directory);
      setStack([]);
      setHasSelectedRoot(true);
      setActiveLocationId(location.id);
    } catch (cause) {
      if (request === requestId.current) setError(errorMessage(cause));
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  const goBack = () => {
    const previous = stack.at(-1);
    if (!previous) return;
    requestId.current += 1;
    setBusy(false);
    setCurrent(previous.directory);
    setEntries(previous.children);
    setTruncated(previous.truncated);
    setSelected(previous.directory);
    setStack((items) => items.slice(0, -1));
  };

  const navigateToPath = (path: string) => {
    const index = stack.findIndex((item) => item.directory.path === path);
    if (index < 0) return;
    requestId.current += 1;
    setBusy(false);
    const target = stack[index];
    setCurrent(target.directory);
    setEntries(target.children);
    setTruncated(target.truncated);
    setSelected(target.directory);
    setStack(stack.slice(0, index));
  };

  const chooseFolder = async () => {
    const request = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await tauriFilesystem.chooseRoot();
      if (request !== requestId.current) return;
      if (!snapshot) return;
      setCurrent(snapshot.directory);
      setEntries(snapshot.children);
      setTruncated(snapshot.truncated);
      setSelected(snapshot.directory);
      setStack([]);
      setHasSelectedRoot(true);
      setActiveLocationId(null);
    } catch (cause) {
      if (request === requestId.current) setError(errorMessage(cause));
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  const loadDefaultDirectory = async () => {
    const request = ++requestId.current;
    setBusy(true);
    try {
      const snapshot = await tauriFilesystem.openDefaultDirectory();
      if (request !== requestId.current) return;
      setCurrent(snapshot.directory);
      setEntries(snapshot.children);
      setTruncated(snapshot.truncated);
      setSelected(snapshot.directory);
      setStack([]);
      setHasSelectedRoot(true);
      setActiveLocationId("home");
      setError(null);
    } catch (cause) {
      if (request === requestId.current) setError(errorMessage(cause));
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (nativeMode) void loadDefaultDirectory();
  }, [nativeMode]);

  useEffect(() => setSearchQuery(""), [current.id]);
  useEffect(() => {
    previewRequestId.current += 1;
    setPreview(null);
    setPreviewBusy(false);
  }, [current.id]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (displayEntries.some((node) => node.id === selected.id)) return;
    setSelected(displayEntries[0] ?? current);
  }, [current, displayEntries, searchQuery, selected.id]);

  useEffect(() => {
    const onFind = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (renameOpen) {
          setRenameOpen(false);
          setRenameName("");
        } else if (createFolderOpen) {
          setCreateFolderOpen(false);
          setNewFolderName("");
        } else if (preview) {
          setPreview(null);
          previewRequestId.current += 1;
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };
    window.addEventListener("keydown", onFind);
    return () => window.removeEventListener("keydown", onFind);
  }, [createFolderOpen, preview, renameOpen]);

  useEffect(() => {
    if (createFolderOpen) {
      folderDialogWasOpen.current = true;
    } else if (!createFolderBusy && folderDialogWasOpen.current) {
      folderDialogWasOpen.current = false;
      createFolderButton.current?.focus();
    }
  }, [createFolderBusy, createFolderOpen]);

  useEffect(() => {
    if (renameOpen) {
      renameDialogWasOpen.current = true;
    } else if (!renameBusy && renameDialogWasOpen.current) {
      renameDialogWasOpen.current = false;
      renameButton.current?.focus();
    }
  }, [renameBusy, renameOpen]);

  useEffect(() => {
    if (!nativeMode) return;
    let cancelled = false;
    void tauriFilesystem.listSidebarLocations()
      .then((locations) => { if (!cancelled) setSidebarLocations(locations); })
      .catch((cause) => { if (!cancelled) setError(errorMessage(cause)); });
    return () => { cancelled = true; };
  }, [nativeMode]);

  useEffect(() => {
    if (!viewportHost.current) return;
    const instance = new ThreeViewport(viewportHost.current, (zoom, depth, maxDepth) => setViewState({ zoom, depth, maxDepth }));
    viewport.current = instance;
    return () => {
      instance.dispose();
      viewport.current = null;
    };
  }, []);

  useEffect(() => {
    viewport.current?.setProjection(projection, selected.id, (id, activate) => {
      const node = sceneNodes.find((entry) => entry.id === id);
      if (!node) return;
      setSelected(node);
      if (activate && node.kind === "directory") openNode(node);
    });
  }, [projection, sceneNodes, selected.id]);

  const openSelected = () => openNode(selected);
  const canPreview = selected.kind === "file" && !!selected.extension && previewableExtensions.has(selected.extension.toLowerCase());
  const showPreview = async () => {
    if (!canPreview) return;
    if (!nativeMode) {
      setError("Text preview is available in the FileVerse desktop app.");
      return;
    }
    const request = ++previewRequestId.current;
    setPreviewBusy(true);
    setError(null);
    try {
      const result = await tauriFilesystem.previewTextFile(selected.path);
      if (request === previewRequestId.current) setPreview({ ...result, name: selected.name });
    } catch (cause) {
      if (request === previewRequestId.current) setError(errorMessage(cause));
    } finally {
      if (request === previewRequestId.current) setPreviewBusy(false);
    }
  };

  const createFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nativeMode || !newFolderName.trim() || createFolderBusy) return;
    setCreateFolderBusy(true);
    setError(null);
    try {
      const snapshot = await tauriFilesystem.createDirectory(current.path, newFolderName);
      setEntries(snapshot.children);
      setTruncated(snapshot.truncated);
      const created = snapshot.children.find((node) => node.name === newFolderName);
      if (created) setSelected(created);
      setCreateFolderOpen(false);
      setNewFolderName("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreateFolderBusy(false);
    }
  };

  const renameSelected = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nativeMode || !renameName.trim() || renameBusy) return;
    setRenameBusy(true);
    setError(null);
    try {
      const snapshot = await tauriFilesystem.renameEntry(selected.path, renameName);
      setEntries(snapshot.children);
      setTruncated(snapshot.truncated);
      setSelected(snapshot.children.find((node) => node.name === renameName) ?? snapshot.directory);
      setRenameOpen(false);
      setRenameName("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRenameBusy(false);
    }
  };

  const copySelectedFile = async () => {
    if (!nativeMode || selected.kind !== "file" || selected.isSymlink || copyBusy) return;
    const source = selected;
    setCopyBusy(true);
    setError(null);
    setNotice(null);
    try {
      const snapshot = await tauriFilesystem.copySelectedFile(source.path);
      if (!snapshot) return;
      if (snapshot.directory.path === current.path) {
        setEntries(snapshot.children);
        setTruncated(snapshot.truncated);
        setSelected(snapshot.children.find((node) => node.name === source.name) ?? source);
      }
      setNotice(`Copied “${source.name}” to ${snapshot.directory.name}.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCopyBusy(false);
    }
  };

  return (
    <main className="app-window">
      <header className="topbar">
        <div className="topbar-left">
          <div className="window-controls" aria-label="Window controls">
            <span className="control red" /><span className="control yellow" /><span className="control green" />
          </div>
          <span className="topbar-product-mark" aria-hidden="true">◈</span>
        </div>
        <div className="topbar-main">
          <button className="history-back" onClick={goBack} disabled={stack.length === 0} aria-label="Go back" title="Go back">‹</button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <button className="home-crumb" onClick={() => breadcrumbs[0] && navigateToPath(breadcrumbs[0].path)} aria-label="Go to selected root" disabled={!hasSelectedRoot}>⌂</button>
            <span className="crumb-wrap volume-crumb"><span className="crumb-chevron">›</span><button className="crumb" disabled>Macintosh HD</button></span>
            {breadcrumbs.map((crumb) => (
              <span className="crumb-wrap" key={crumb.path}>
                <span className="crumb-chevron">›</span>
                <button className={`crumb ${crumb.current ? "current" : ""}`} onClick={() => navigateToPath(crumb.path)} disabled={crumb.current || !stack.some((item) => item.directory.path === crumb.path)}>{crumb.name}</button>
              </span>
            ))}
          </nav>
          <div className="topbar-tools">
            <div className="search-box"><span className="search-icon" aria-hidden="true">⌕</span><input ref={searchInput} aria-label="Search this folder" placeholder={`Search in ${current.name}…`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery && <button className="search-clear" type="button" onClick={() => { setSearchQuery(""); searchInput.current?.focus(); }} aria-label="Clear search">×</button>}<kbd>{navigator.platform.includes("Mac") ? "⌘ F" : "Ctrl F"}</kbd></div>
            <select className="sort-select" aria-label="Sort current folder" value={sortMode} onChange={(event) => setSortMode(event.target.value)} title="Sort the current folder">
              <option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="modified">Recently modified</option><option value="size">Largest first</option>
            </select>
            <button className="open-folder-button" onClick={() => nativeMode ? chooseFolder() : setError("Choose Folder is available in the FileVerse desktop app.")} disabled={busy}>Open Folder</button>
            <div className="view-switch" aria-label="View mode"><button className="view-mode selected-view" aria-label="Spatial view">▦</button><button className="view-mode" aria-label="List view" disabled>▤</button></div>
            <button className="tool-button" aria-label="View settings" title="View settings" disabled>☷</button>
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="side-group">
            <div className="sidebar-section-label">FAVORITES</div>
            {sidebarLocations.map((location) => (
              <button key={location.id} className={`sidebar-item ${activeLocationId === location.id ? "active" : ""}`} onClick={() => void openSidebarLocation(location)} disabled={busy} aria-current={activeLocationId === location.id ? "page" : undefined}>
                <span className={`sidebar-icon ${location.id === "home" ? "drive-icon" : location.id === "downloads" ? "download-icon" : "folder-icon"}`}>{location.id === "downloads" ? "↓" : location.id === "home" ? "⌂" : "▰"}</span>
                <span>{location.name}</span>
              </button>
            ))}
          </section>
          <section className="side-group location-group">
            <div className="sidebar-section-label">LOCATIONS</div>
            <button className="sidebar-item" disabled title="Cloud and network locations are planned for a later milestone"><span className="sidebar-icon cloud-icon">☁</span><span>Cloud & Network</span></button>
          </section>
          <section className="side-group tags-group">
            <div className="sidebar-section-label">TAGS</div>
            <button className="sidebar-item" disabled title="Tags are planned for a later milestone"><i className="tag-dot red-tag" />Tags are coming later</button>
          </section>
        </aside>

        <section className="spatial-workspace" aria-label="Spatial filesystem view">
          <div className="scene-shell">
            <div className="landscape-glow" />
            <svg className="mountain-backdrop" viewBox="0 0 1500 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
              <defs>
                <linearGradient id="mountainFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#172641" /><stop offset="1" stopColor="#080f1c" /></linearGradient>
                <linearGradient id="horizonFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#758ed1" stopOpacity=".44" /><stop offset="1" stopColor="#536b9a" stopOpacity="0" /></linearGradient>
                <filter id="mountainBlur"><feGaussianBlur stdDeviation="11" /></filter>
              </defs>
              <ellipse cx="760" cy="203" rx="400" ry="72" fill="url(#horizonFade)" filter="url(#mountainBlur)" />
              <path d="M0 248 L70 222 128 233 214 180 277 211 355 166 414 205 501 155 563 198 642 164 724 204 797 141 861 186 948 157 1009 193 1088 130 1159 177 1233 148 1301 198 1381 163 1500 226 1500 360 0 360Z" fill="url(#mountainFill)" opacity=".74" />
              <path d="M0 278 L109 245 183 260 274 221 352 248 427 206 505 238 582 215 666 245 738 203 813 237 883 195 961 231 1034 192 1117 233 1190 199 1268 241 1355 203 1500 256 1500 360 0 360Z" fill="#0a1221" opacity=".94" />
              <path d="M0 303 L144 278 267 289 380 261 509 287 628 261 748 289 868 264 988 293 1104 264 1217 291 1336 267 1500 294 1500 360 0 360Z" fill="#080e19" />
            </svg>
            <div className="scene-horizon" />
            <div className="scene-depth-caption"><span>SPATIAL DEPTH</span><i /><i /><i /></div>
            <div className="scene-zoom-controls" role="group" aria-label="Spatial view controls" title="Pinch to zoom · horizontal scroll to orbit · vertical scroll through depth · drag to orbit">
              <button onClick={() => viewport.current?.zoomBy(-1)} disabled={zoomLevel <= 0.721} aria-label="Zoom out" title="Zoom out">−</button>
              <output aria-label="Zoom level">{Math.round(zoomLevel * 100)}%</output>
              <button onClick={() => viewport.current?.zoomBy(1)} disabled={zoomLevel >= 1.599} aria-label="Zoom in" title="Zoom in">+</button>
              <span className="zoom-control-divider" aria-hidden="true" />
              <button onClick={() => viewport.current?.moveThroughDepth(1)} disabled={viewState.depth >= viewState.maxDepth - 0.001} aria-label="Move deeper into the scene" title="Move deeper">↓</button>
              <button onClick={() => viewport.current?.moveThroughDepth(-1)} disabled={viewState.depth <= 0.001} aria-label="Move toward the entrance" title="Move toward entrance">↑</button>
              <button className="zoom-reset" onClick={() => viewport.current?.resetView()} aria-label="Reset view" title="Reset zoom and camera angle">Reset</button>
            </div>
            <div className="scene-viewport" ref={viewportHost} />
            <div className="ground-reflection" />

            {hasSelectedRoot && !busy && visibleEntries.length === 0 && <div className="empty-folder-state">
              <span aria-hidden="true">{entries.length === 0 ? "▱" : "⌕"}</span>
              <strong>{entries.length === 0 ? "This folder is empty" : "No matching items"}</strong>
              <small>{entries.length === 0 ? "Choose another folder or go back to continue exploring." : `No names in ${current.name} match “${searchQuery.trim()}”.`}</small>
            </div>}

            {nativeMode && !hasSelectedRoot && <div className="choose-root-prompt">
              <h2>{error ? "Choose a folder to explore" : "Opening your Home folder…"}</h2>
              <p>{error ? error : "Loading your files into the spatial view."}</p>
              {error && <button onClick={chooseFolder} disabled={busy}>Choose Folder</button>}
            </div>}

            <div className="scene-accessible-list" role="region" aria-label={`Keyboard navigation items in ${current.name}`}>
              {displayEntries.map((node) => (
                <button key={node.id} onFocus={() => setSelected(node)} onClick={() => setSelected(node)} onKeyDown={(event) => {
                  if (event.key === "Enter" && node.kind === "directory") openNode(node);
                }}>
                  {node.kind === "directory" ? "Folder" : "File"}: {node.name}
                </button>
              ))}
            </div>

            <section className="info-dock" aria-label="Selected item details">
              <div className="dock-item-summary">
                <div className={`dock-preview ${selected.kind === "directory" ? "folder-preview" : "file-preview"}`}>
                  {selected.kind === "directory" ? <span className="dock-folder-shape" /> : <span className="dock-file-type">{selected.extension?.toUpperCase() ?? "FILE"}</span>}
                </div>
                <div className="dock-primary-text"><h1>{selected.name}</h1><p>{selected.id === current.id ? "Current folder" : selected.kind === "directory" ? "Folder" : "File"}<span>•</span>{selectedItemCount} items</p><div className="dock-path">{selected.path}</div></div>
              </div>
              <div className="dock-metadata">
                <div><span>Modified</span><b>{prettyDate(selected.modifiedAt)}</b></div>
                <div><span>Size</span><b>{prettySize(selected.sizeBytes)}</b></div>
                <div><span>Kind</span><b>{selected.kind === "directory" ? "Folder" : `${selected.extension?.toUpperCase() ?? "File"} File`}</b></div>
              </div>
              <div className="dock-actions">
                <button className="dock-action open-action" onClick={openSelected} disabled={selected.kind !== "directory" || selected.id === current.id} title={selected.id === current.id ? "This folder is already open" : selected.kind !== "directory" ? "Select a folder to open it" : "Open selected folder"}><span>▱</span><small>{selected.id === current.id ? "Current" : "Open"}</small></button>
                <button className="dock-action" onClick={() => void showPreview()} disabled={!canPreview || previewBusy} title={canPreview ? "Preview this text file (up to 64 KB)" : "Select a supported text file to preview"}><span>◉</span><small>{previewBusy ? "Loading…" : "Preview"}</small></button>
                <button className="dock-action" onClick={() => void copySelectedFile()} disabled={!nativeMode || selected.kind !== "file" || selected.isSymlink || busy || copyBusy} title={selected.kind === "file" && !selected.isSymlink ? "Copy this file to a folder inside the selected root" : "Select a regular file to copy"}><span>▧</span><small>{copyBusy ? "Copying…" : "Copy"}</small></button>
                <button ref={createFolderButton} className="dock-action" onClick={() => { setError(null); setCreateFolderOpen(true); }} disabled={!nativeMode || !hasSelectedRoot || busy || createFolderBusy} title="Create a folder in the current directory"><span>▱<sup>+</sup></span><small>New Folder</small></button>
                <button ref={renameButton} className="dock-action" onClick={() => { setError(null); setRenameName(selected.name); setRenameOpen(true); }} disabled={!nativeMode || !hasSelectedRoot || selected.id === current.id || selected.isSymlink || selected.kind === "other" || busy || renameBusy} title={selected.id === current.id ? "Select an item inside this folder to rename" : "Rename selected item"}><span>✎</span><small>Rename</small></button>
                <button className="dock-action" disabled title="Sharing is planned for a later milestone"><span>↥</span><small>Share</small></button>
                <button className="dock-action" disabled title="Get Info is planned for a later milestone"><span>ⓘ</span><small>Get Info</small></button>
                <button className="dock-more" disabled aria-label="More actions">•••</button>
              </div>
            </section>
            {preview && <section className="text-preview-panel" role="dialog" aria-modal="false" aria-label={`Text preview: ${preview.name}`}>
              <header><div><strong>{preview.name}</strong><small>Text preview · up to 64 KB</small></div><button onClick={() => { setPreview(null); previewRequestId.current += 1; }} aria-label="Close preview">×</button></header>
              <pre>{preview.text}</pre>
              {preview.truncated && <footer>Preview limited to the first 64 KB.</footer>}
            </section>}
            {createFolderOpen && <div className="folder-dialog-backdrop">
              <form className="folder-dialog" role="dialog" aria-modal="true" aria-labelledby="create-folder-title" onSubmit={(event) => void createFolder(event)} onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"));
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }}>
                <h2 id="create-folder-title">Create folder</h2>
                <label htmlFor="new-folder-name">Folder name</label>
                <input id="new-folder-name" autoFocus maxLength={255} value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Enter a name" />
                <div className="folder-dialog-actions">
                  <button type="button" onClick={() => { setCreateFolderOpen(false); setNewFolderName(""); }} disabled={createFolderBusy}>Cancel</button>
                  <button type="submit" disabled={!newFolderName.trim() || createFolderBusy}>{createFolderBusy ? "Creating…" : "Create"}</button>
                </div>
              </form>
            </div>}
            {renameOpen && <div className="folder-dialog-backdrop">
              <form className="folder-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-item-title" onSubmit={(event) => void renameSelected(event)} onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"));
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }}>
                <h2 id="rename-item-title">Rename item</h2>
                <label htmlFor="rename-item-name">New name</label>
                <input id="rename-item-name" autoFocus maxLength={255} value={renameName} onChange={(event) => setRenameName(event.target.value)} placeholder="Enter a name" />
                <div className="folder-dialog-actions">
                  <button type="button" onClick={() => { setRenameOpen(false); setRenameName(""); }} disabled={renameBusy}>Cancel</button>
                  <button type="submit" disabled={!renameName.trim() || renameName === selected.name || renameBusy}>{renameBusy ? "Renaming…" : "Rename"}</button>
                </div>
              </form>
            </div>}
          </div>
        </section>
      </div>
      {error && <div className="filesystem-error" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error">×</button></div>}
      <div className="statusbar"><span><i /> {busy ? "Reading folder…" : nativeMode ? hasSelectedRoot ? "Local filesystem" : "Waiting for a folder" : "Local spatial preview"}</span><span>{notice ?? (searchQuery.trim() ? `${visibleEntries.length} matches in loaded items · ` : "")}{notice ? "" : truncated ? `Showing first 300 of a large folder · ${entries.length} loaded` : hasSelectedRoot ? `${entries.length} items${entries.length > 32 ? " · first 32 in spatial view; all available in keyboard list" : ""} · ${nativeMode ? "Local folder" : "Sample data"}` : nativeMode ? "Loading Home folder" : "Sample data"}</span></div>
    </main>
  );
}
