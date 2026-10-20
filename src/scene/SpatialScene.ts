import * as THREE from "three";
import type { FileNode } from "../filesystem/types";

export interface SceneItem {
  node: FileNode;
  position: THREE.Vector3;
  scale: number;
  opacity: number;
  rotationZ: number;
  caption: string;
  role: "current" | "sibling" | "child" | "deeper";
}

export interface SceneProjection {
  currentDirectoryId: string;
  items: SceneItem[];
  cameraTarget: THREE.Vector3;
}

/** Show the open directory's actual contents as the scene's primary cards. */
export function projectDirectory(current: FileNode, children: FileNode[]): SceneProjection {
  const items: SceneItem[] = [];
  const columns = 4;
  children.slice(0, 32).forEach((node, index) => {
    const row = Math.floor(index / columns);
    const countOnRow = Math.min(columns, children.length - row * columns);
    const col = index % columns;
    const x = (col - (countOnRow - 1) / 2) * 2.45;
    const y = -0.25 + row * 0.95;
    const z = 1.2 - row * 2.2;
    const scale = Math.max(0.48, 0.79 - row * 0.055);
    items.push({
      node,
      position: new THREE.Vector3(x, y, z),
      scale,
      opacity: Math.max(0.55, 1 - row * 0.08),
      rotationZ: Math.sin(index * 5.3) * 0.035,
      caption: node.kind === "directory" ? "Open folder" : (node.extension?.toUpperCase() ?? "File"),
      role: row === 0 ? "child" : "deeper",
    });
  });

  return { currentDirectoryId: current.id, items, cameraTarget: new THREE.Vector3(0, -0.1, 0) };
}
