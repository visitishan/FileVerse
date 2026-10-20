import type { DirectorySnapshot, FileNode } from "../filesystem/types";

const root: FileNode = {
  id: "sample:FileVerse",
  path: "/Users/ishan/Projects/FileVerse",
  parentId: null,
  name: "FileVerse",
  kind: "directory",
  extension: null,
  sizeBytes: null,
  modifiedAt: "2026-10-20T15:40:00Z",
  hidden: false,
  isSymlink: false,
};

const makeNode = (
  name: string,
  kind: FileNode["kind"],
  sizeBytes: number | null,
  modifiedAt: string,
): FileNode => ({
  id: `sample:${name}`,
  path: `${root.path}/${name}`,
  parentId: root.id,
  name,
  kind,
  extension: kind === "file" && name.includes(".") ? name.split(".").pop()!.toLowerCase() : null,
  sizeBytes,
  modifiedAt,
  hidden: name.startsWith("."),
  isSymlink: false,
});

export const sampleSnapshot: DirectorySnapshot = {
  directory: root,
  loadedAt: "2026-10-21T00:00:00Z",
  truncated: false,
  children: [
    makeNode("src", "directory", null, "2026-10-20T15:38:00Z"),
    makeNode("public", "directory", null, "2026-10-20T14:10:00Z"),
    makeNode("design", "directory", null, "2026-10-19T12:30:00Z"),
    makeNode("docs", "directory", null, "2026-10-18T09:12:00Z"),
    makeNode("package.json", "file", 842, "2026-10-20T15:40:00Z"),
    makeNode("README.md", "file", 3260, "2026-10-19T11:20:00Z"),
    makeNode("vite.config.ts", "file", 512, "2026-10-20T15:15:00Z"),
    makeNode(".gitignore", "file", 108, "2026-10-16T08:30:00Z"),
  ],
};

export const sampleChildren: Record<string, FileNode[]> = {
  ["sample:src"]: [
    { ...makeNode("App.tsx", "file", 6240, "2026-10-20T15:38:00Z"), id: "sample:src:App.tsx", path: `${root.path}/src/App.tsx`, parentId: "sample:src" },
    { ...makeNode("components", "directory", null, "2026-10-20T15:20:00Z"), id: "sample:src:components", path: `${root.path}/src/components`, parentId: "sample:src" },
    { ...makeNode("scene", "directory", null, "2026-10-20T15:02:00Z"), id: "sample:src:scene", path: `${root.path}/src/scene`, parentId: "sample:src" },
    { ...makeNode("styles.css", "file", 2910, "2026-10-20T14:52:00Z"), id: "sample:src:styles.css", path: `${root.path}/src/styles.css`, parentId: "sample:src" },
  ],
};

const makeContextNode = (id: string, name: string, path: string): FileNode => ({
  id,
  path,
  parentId: "sample:context",
  name,
  kind: "directory",
  extension: null,
  sizeBytes: null,
  modifiedAt: null,
  hidden: false,
  isSymlink: false,
});

export const sampleSiblings: FileNode[] = [
  makeContextNode("context:users", "Users", "/Users"),
  makeContextNode("context:projects", "Projects", "/Users/ishan/Projects"),
  makeContextNode("context:examples", "examples", "/Users/ishan/Projects/examples"),
  makeContextNode("context:ui", "ui", "/Users/ishan/Projects/ui"),
];

export const sampleDeeper: FileNode[] = [
  "components", "icons", "utils", "hooks", "layout", "assets", "tests", "stories",
  "buttons", "cards", "panels", "theme", "fonts", "tokens", "pages", "state",
  "models", "scene", "shaders", "fixtures", "config", "examples", "scripts", "styles",
].map((name, index) => makeContextNode(`context:deep:${index}`, name, `${sampleSnapshot.directory.path}/src/${name}`));
