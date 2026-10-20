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

export interface SidebarLocation {
  id: string;
  name: string;
}

export interface FilesystemPort {
  openDefaultDirectory(): Promise<DirectorySnapshot>;
  listSidebarLocations(): Promise<SidebarLocation[]>;
  openSidebarLocation(id: string): Promise<DirectorySnapshot>;
  chooseRoot(): Promise<DirectorySnapshot | null>;
  listDirectory(path: string): Promise<DirectorySnapshot>;
}
