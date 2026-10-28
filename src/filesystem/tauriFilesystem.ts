import { invoke } from "@tauri-apps/api/core";
import type { DirectorySnapshot, FilesystemPort, SidebarLocation, TextPreview } from "./types";

export const isNativeRuntime = () => "__TAURI_INTERNALS__" in window;

export const tauriFilesystem: FilesystemPort = {
  openDefaultDirectory() {
    return invoke<DirectorySnapshot>("open_default_directory");
  },
  listSidebarLocations() {
    return invoke<SidebarLocation[]>("list_sidebar_locations");
  },
  openSidebarLocation(id: string) {
    return invoke<DirectorySnapshot>("open_sidebar_location", { id });
  },
  chooseRoot() {
    return invoke<DirectorySnapshot | null>("choose_root");
  },
  listDirectory(path: string) {
    return invoke<DirectorySnapshot>("list_directory", { path });
  },
  previewTextFile(path: string) {
    return invoke<TextPreview>("preview_text_file", { path });
  },
  createDirectory(parentPath: string, name: string) {
    return invoke<DirectorySnapshot>("create_directory", { parentPath, name });
  },
  renameEntry(path: string, name: string) {
    return invoke<DirectorySnapshot>("rename_entry", { path, name });
  },
};
