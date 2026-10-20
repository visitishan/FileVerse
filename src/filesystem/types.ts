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

export interface FilesystemPort {
  openDefaultDirectory(): Promise<DirectorySnapshot>;
  chooseRoot(): Promise<FileNode | null>;
  listDirectory(path: string): Promise<DirectorySnapshot>;
}
