import { invoke } from "@tauri-apps/api/core";
import type { DirectorySnapshot, FileNode, FilesystemPort } from "./types";

export const isNativeRuntime = () => "__TAURI_INTERNALS__" in window;

export const tauriFilesystem: FilesystemPort = {
  openDefaultDirectory() {
    return invoke<DirectorySnapshot>("open_default_directory");
  },
  async chooseRoot(): Promise<FileNode | null> {
    return invoke<FileNode | null>("choose_root");
  },
  listDirectory(path: string) {
    return invoke<DirectorySnapshot>("list_directory", { path });
  },
};
