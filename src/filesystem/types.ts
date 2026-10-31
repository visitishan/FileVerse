export type EntryKind = "directory" | "file" | "symlink" | "other";

export interface FileNode {
  id: string;
  path: string;
  parentId: string | null;
  name: string;
  kind: EntryKind;
  extension: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  hidden: boolean;
  isSymlink: boolean;
}

export interface DirectorySnapshot {
  directory: FileNode;
  children: FileNode[];
  loadedAt: string;
  truncated: boolean;
}

export interface MoveFileResult {
  sourceParent: DirectorySnapshot;
  destination: DirectorySnapshot;
}

export interface SidebarLocation {
  id: string;
  name: string;
}

export interface TextPreview {
  text: string;
  truncated: boolean;
}

export interface FilesystemPort {
  openDefaultDirectory(): Promise<DirectorySnapshot>;
  listSidebarLocations(): Promise<SidebarLocation[]>;
  openSidebarLocation(id: string): Promise<DirectorySnapshot>;
  chooseRoot(): Promise<DirectorySnapshot | null>;
  listDirectory(path: string): Promise<DirectorySnapshot>;
  previewTextFile(path: string): Promise<TextPreview>;
  createDirectory(parentPath: string, name: string): Promise<DirectorySnapshot>;
  renameEntry(path: string, name: string): Promise<DirectorySnapshot>;
  copySelectedFile(path: string): Promise<DirectorySnapshot | null>;
  moveSelectedFile(path: string): Promise<MoveFileResult | null>;
  trashEntry(path: string): Promise<DirectorySnapshot>;
}
