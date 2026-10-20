import * as THREE from "three";
import type { SceneProjection } from "./SpatialScene";

interface CardHandle {
  mesh: THREE.Mesh;
  nodeId: string;
}

interface RecentClick {
  nodeId: string;
  time: number;
}

interface CardMotion {
  mesh: THREE.Mesh;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromScale: number;
  toScale: number;
  fromOpacity: number;
  toOpacity: number;
  startedAt: number;
  duration: number;
  removeAtEnd: boolean;
}

export class ThreeViewport {
  private static readonly baseCameraZ = 13.6;
  private static readonly minZoom = 0.72;
  private static readonly maxZoom = 1.6;
  private static readonly zoomStep = 0.08;
  private static readonly minOrbitPitch = -1.42;
  private static readonly maxOrbitPitch = 1.42;
  private static readonly defaultOrbitPitch = 0.03;
  private static readonly wheelOrbitSensitivity = 0.0025;
  private static readonly dragOrbitSensitivity = 0.005;
  private static readonly depthStep = 1.2;
  private static readonly depthFocusDistance = 8;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cards: CardHandle[] = [];
  private readonly motions: CardMotion[] = [];
  private sceneDepthPositions: THREE.Vector3[] = [];
  private readonly clock = new THREE.Clock();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private frame = 0;
  private recentClick: RecentClick | null = null;
  private dragPointerId: number | null = null;
  private lastDragPoint: THREE.Vector2 | null = null;
  private dragDistance = 0;
  private ignoreClickUntil = 0;
  private onActivate: ((nodeId: string, activate: boolean) => void) | null = null;
  private currentDirectoryId: string | null = null;
  private cameraTravelStartedAt = 0;
  private zoomLevel = 1;
  private gestureStartZoom = 1;
  private orbitYaw = 0;
  private targetOrbitYaw = 0;
  private orbitPitch = ThreeViewport.defaultOrbitPitch;
  private targetOrbitPitch = ThreeViewport.defaultOrbitPitch;
  private depthTravel = 0;
  private targetDepthTravel = 0;
  private hasSceneItems = false;
  private readonly transitionDuration = 680;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly host: HTMLElement, private readonly onViewChange: (zoom: number, depth: number, maxDepth: number) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = "scene-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Interactive spatial view of the current folder");
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 0.4, ThreeViewport.baseCameraZ);
    this.scene.fog = new THREE.FogExp2(0x080d18, 0.022);
    this.scene.add(new THREE.AmbientLight(0x9db6e5, 1.55));
    const key = new THREE.PointLight(0x78aaff, 42, 30);
    key.position.set(-3, 6, 7);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x4d68ff, 35, 22);
    rim.position.set(6, -3, -2);
    this.scene.add(rim);
    this.addAtmosphere();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.handlePointerUp);
    this.renderer.domElement.addEventListener("click", this.handleClick);
    this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener("gesturestart", this.handleGestureStart);
    this.renderer.domElement.addEventListener("gesturechange", this.handleGestureChange);
    this.resize();
    this.animate();
  }

  setProjection(projection: SceneProjection, selectedId: string | null, onActivate: (nodeId: string, activate: boolean) => void) {
    this.onActivate = onActivate;
    const enteringDirectory = this.currentDirectoryId !== null && this.currentDirectoryId !== projection.currentDirectoryId;
    this.sceneDepthPositions = projection.items.map((item) => item.position);
    this.hasSceneItems = projection.items.length > 0;
    if (enteringDirectory) {
      this.setZoomLevel(1);
      this.targetOrbitYaw = 0;
      this.targetOrbitPitch = ThreeViewport.defaultOrbitPitch;
      this.depthTravel = 0;
      this.targetDepthTravel = 0;
    }
    this.motions.splice(0).filter((motion) => motion.removeAtEnd).forEach(({ mesh }) => this.disposeCard(mesh));
    const now = performance.now();
    this.cards.forEach(({ mesh }) => {
      if (enteringDirectory && !this.reducedMotion) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        const fromPosition = mesh.position.clone();
        const toPosition = fromPosition.clone().addScaledVector(this.orbitDirection(this.orbitYaw, this.orbitPitch), 4.2);
        const scale = mesh.scale.x;
        this.motions.push({ mesh, fromPosition, toPosition, fromScale: scale, toScale: scale * 1.12, fromOpacity: material.opacity, toOpacity: 0, startedAt: now, duration: this.transitionDuration, removeAtEnd: true });
      } else {
        this.disposeCard(mesh);
      }
    });
    this.cards.length = 0;
    if (enteringDirectory && !this.reducedMotion) this.cameraTravelStartedAt = now;
    projection.items.forEach((item, index) => {
      const mesh = this.createCard(item.node.name, item.node.kind === "directory", item.node.id, selectedId === item.node.id || item.role === "current", item.caption);
      mesh.position.copy(item.position);
      mesh.scale.setScalar(item.scale);
      mesh.rotation.z = item.rotationZ;
      mesh.userData.layoutRotationZ = item.rotationZ;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = item.opacity;
      mesh.userData.nodeId = item.node.id;
      mesh.userData.index = index;
      if (enteringDirectory && !this.reducedMotion) {
        const targetPosition = item.position.clone();
        const fromPosition = targetPosition.clone().add(new THREE.Vector3(0, 0.35, -5.8));
        mesh.position.copy(fromPosition);
        const targetScale = item.scale;
        mesh.scale.setScalar(targetScale * 0.72);
        material.opacity = 0.04;
        this.motions.push({ mesh, fromPosition, toPosition: targetPosition, fromScale: targetScale * 0.72, toScale: targetScale, fromOpacity: 0.04, toOpacity: item.opacity, startedAt: now, duration: this.transitionDuration, removeAtEnd: false });
      }
      this.scene.add(mesh);
      this.cards.push({ mesh, nodeId: item.node.id });
    });
    this.currentDirectoryId = projection.currentDirectoryId;
    this.onViewChange(this.zoomLevel, this.targetDepthTravel, this.maxDepthTravel());
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.renderer.domElement.removeEventListener("wheel", this.handleWheel);
    this.renderer.domElement.removeEventListener("gesturestart", this.handleGestureStart);
    this.renderer.domElement.removeEventListener("gesturechange", this.handleGestureChange);
    const disposed = new Set<THREE.Mesh>();
    this.cards.forEach(({ mesh }) => {
      disposed.add(mesh);
      this.disposeCard(mesh);
    });
    this.motions.splice(0).forEach(({ mesh }) => {
      if (!disposed.has(mesh)) this.disposeCard(mesh);
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private createCard(name: string, directory: boolean, id: string, selected: boolean, caption: string) {
    const texture = this.makeCardTexture(name, directory, selected, caption);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(directory ? 2.55 : 2.2, directory ? 2.08 : 1.4, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.nodeId = id;
    mesh.userData.directory = directory;
    return mesh;
  }

  private makeCardTexture(name: string, directory: boolean, selected: boolean, caption: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 520;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const x = 28, y = 24, w = 712, h = 472, r = 34;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const fill = ctx.createLinearGradient(0, 20, 700, 520);
    fill.addColorStop(0, directory ? "rgba(30,48,78,.81)" : "rgba(24,34,52,.72)");
    fill.addColorStop(1, directory ? "rgba(13,23,41,.68)" : "rgba(11,18,30,.58)");
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = selected ? 5 : 1.5;
    ctx.strokeStyle = selected ? "rgba(104,172,255,.98)" : "rgba(190,211,245,.22)";
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = selected ? "rgba(37,119,255,.9)" : "rgba(92,151,255,.24)";
    ctx.shadowBlur = selected ? 42 : 15;
    ctx.strokeStyle = selected ? "rgba(90,158,255,.5)" : "rgba(90,136,208,.07)";
    ctx.lineWidth = selected ? 12 : 6;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(58, 49);
    ctx.lineTo(710, 49);
    ctx.stroke();

    if (directory) {
      this.drawFolderIcon(ctx, 300, 108);
    } else {
      this.drawFileIcon(ctx, 330, 105, name.split(".").pop() ?? "FILE");
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#eef4ff";
    ctx.font = "600 37px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(name, 384, 374, 630);
    ctx.fillStyle = "rgba(197,213,239,.58)";
    ctx.font = "500 21px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(caption, 384, 417);
    return new THREE.CanvasTexture(canvas);
  }

  private drawFolderIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.shadowColor = "rgba(77,151,255,.48)";
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 25);
    ctx.quadraticCurveTo(x + 6, y + 12, x + 20, y + 12);
    ctx.lineTo(x + 89, y + 12);
    ctx.quadraticCurveTo(x + 101, y + 12, x + 109, y + 24);
    ctx.lineTo(x + 119, y + 39);
    ctx.lineTo(x + 163, y + 39);
    ctx.quadraticCurveTo(x + 176, y + 39, x + 176, y + 53);
    ctx.lineTo(x + 169, y + 124);
    ctx.quadraticCurveTo(x + 168, y + 138, x + 153, y + 138);
    ctx.lineTo(x + 20, y + 138);
    ctx.quadraticCurveTo(x + 6, y + 138, x + 6, y + 123);
    ctx.closePath();
    const grad = ctx.createLinearGradient(x, y, x + 170, y + 150);
    grad.addColorStop(0, "#7db8ff");
    grad.addColorStop(.48, "#4288ed");
    grad.addColorStop(1, "#255cc6");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(210,233,255,.62)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  private drawFileIcon(ctx: CanvasRenderingContext2D, x: number, y: number, extension: string) {
    const accent = extension === "tsx" || extension === "ts" ? "#89a9ff" : extension === "md" ? "#8dd7d0" : "#d5e0f4";
    ctx.save();
    ctx.shadowColor = "rgba(80,133,212,.3)";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.roundRect(x, y, 112, 144, 16);
    ctx.fillStyle = "rgba(183,207,243,.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(196,219,255,.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "700 23px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(extension.toUpperCase().slice(0, 5), x + 56, y + 83);
    ctx.restore();
  }

  private addAtmosphere() {
    const grid = new THREE.GridHelper(90, 90, 0x293d5a, 0x1a273a);
    grid.position.y = -1.96;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    this.scene.add(grid);

    const points: number[] = [];
    for (let i = 0; i < 150; i++) {
      points.push((Math.random() - .5) * 46, (Math.random() - .5) * 24, -8 - Math.random() * 20);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x91baff, size: .025, transparent: true, opacity: .5 }));
    this.scene.add(stars);
  }

  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();
    const now = performance.now();
    let cameraDistance = ThreeViewport.baseCameraZ / this.zoomLevel;
    if (this.cameraTravelStartedAt) {
      const progress = Math.min(1, (now - this.cameraTravelStartedAt) / this.transitionDuration);
      cameraDistance -= Math.sin(progress * Math.PI) * 1.15;
      if (progress >= 1) this.cameraTravelStartedAt = 0;
    }
    this.orbitYaw = this.reducedMotion
      ? this.targetOrbitYaw
      : this.orbitYaw + (this.targetOrbitYaw - this.orbitYaw) * 0.12;
    this.orbitPitch = this.reducedMotion
      ? this.targetOrbitPitch
      : this.orbitPitch + (this.targetOrbitPitch - this.orbitPitch) * 0.12;
    this.depthTravel = this.reducedMotion
      ? this.targetDepthTravel
      : this.depthTravel + (this.targetDepthTravel - this.depthTravel) * 0.12;
    this.positionCamera(cameraDistance, this.depthTravel);
    for (let index = this.motions.length - 1; index >= 0; index--) {
      const motion = this.motions[index];
      const raw = Math.min(1, (now - motion.startedAt) / motion.duration);
      const eased = raw * raw * (3 - 2 * raw);
      motion.mesh.position.lerpVectors(motion.fromPosition, motion.toPosition, eased);
      const scale = THREE.MathUtils.lerp(motion.fromScale, motion.toScale, eased);
      motion.mesh.scale.setScalar(scale);
      (motion.mesh.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(motion.fromOpacity, motion.toOpacity, eased);
      if (raw >= 1) {
        this.motions.splice(index, 1);
        if (motion.removeAtEnd) this.disposeCard(motion.mesh);
      }
    }
    this.cards.forEach(({ mesh }, index) => {
      const base = mesh.userData.baseY ?? mesh.position.y;
      mesh.userData.baseY = base;
      if (!this.reducedMotion) mesh.position.y = base + Math.sin(elapsed * .65 + index * .72) * .035;
      // Keep card labels legible while the camera orbits past the back side of the scene.
      mesh.lookAt(this.camera.position);
      mesh.rotateZ(mesh.userData.layoutRotationZ ?? 0);
    });
    this.renderer.render(this.scene, this.camera);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.updatePointer(event);
    if (this.dragPointerId === event.pointerId && this.lastDragPoint) {
      const deltaX = event.clientX - this.lastDragPoint.x;
      const deltaY = event.clientY - this.lastDragPoint.y;
      this.lastDragPoint.set(event.clientX, event.clientY);
      this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
      if (this.dragDistance > 4) {
        this.recentClick = null;
        this.orbitBy(-deltaX, deltaY, ThreeViewport.dragOrbitSensitivity);
      }
      this.renderer.domElement.style.cursor = this.dragDistance > 4 ? "grabbing" : "grab";
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.cards.map(({ mesh }) => mesh))[0];
    this.renderer.domElement.style.cursor = hit ? "pointer" : "default";
  };

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.dragPointerId !== null) return;
    this.dragPointerId = event.pointerId;
    this.lastDragPoint = new THREE.Vector2(event.clientX, event.clientY);
    this.dragDistance = 0;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = "grab";
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (this.dragPointerId !== event.pointerId) return;
    const wasDrag = this.dragDistance > 4;
    this.dragPointerId = null;
    this.lastDragPoint = null;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    if (wasDrag) this.ignoreClickUntil = performance.now() + 300;
    this.renderer.domElement.style.cursor = "default";
  };

  private handleWheel = (event: WheelEvent) => {
    const deltaX = this.wheelPixels(event.deltaX, event.deltaMode);
    const deltaY = this.wheelPixels(event.deltaY, event.deltaMode);
    // macOS trackpad pinch is surfaced as a modified wheel event in WebView.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.setZoomLevel(this.zoomLevel * Math.exp(-deltaY * 0.002));
      return;
    }
    // Two-axis trackpad or wheel input orbits around the spatial field.
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      event.preventDefault();
      this.orbitBy(deltaX, deltaY, ThreeViewport.wheelOrbitSensitivity);
    }
  };

  private handleGestureStart = (event: Event) => {
    event.preventDefault();
    this.gestureStartZoom = this.zoomLevel;
  };

  private handleGestureChange = (event: Event) => {
    event.preventDefault();
    const scale = (event as Event & { scale?: number }).scale;
    if (typeof scale === "number" && Number.isFinite(scale)) {
      this.setZoomLevel(this.gestureStartZoom * scale);
    }
  };

  private handleClick = (event: MouseEvent) => {
    if (performance.now() < this.ignoreClickUntil) {
      this.ignoreClickUntil = 0;
      return;
    }
    this.ignoreClickUntil = 0;
    this.updatePointer(event);
    const hit = this.findHit();
    const id = hit?.object.userData.nodeId;
    if (typeof id !== "string") {
      this.recentClick = null;
      return;
    }

    const now = performance.now();
    const isSecondClick = this.recentClick?.nodeId === id && now - this.recentClick.time <= 500;
    this.recentClick = isSecondClick ? null : { nodeId: id, time: now };
    this.onActivate?.(id, isSecondClick);
  };

  private updatePointer(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private findHit() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.cards.map(({ mesh }) => mesh))[0];
  }

  zoomBy(direction: -1 | 1) {
    this.setZoomLevel(this.zoomLevel + direction * ThreeViewport.zoomStep);
  }

  resetView() {
    this.setZoomLevel(1);
    this.targetOrbitYaw = 0;
    this.targetOrbitPitch = ThreeViewport.defaultOrbitPitch;
    this.targetDepthTravel = 0;
    this.onViewChange(1, 0, this.maxDepthTravel());
  }

  moveThroughDepth(direction: -1 | 1) {
    this.moveThroughDepthBy(direction * ThreeViewport.depthStep);
  }

  private moveThroughDepthBy(amount: number) {
    this.targetDepthTravel = THREE.MathUtils.clamp(
      this.targetDepthTravel + amount,
      0,
      this.maxDepthTravel(),
    );
    this.onViewChange(this.zoomLevel, this.targetDepthTravel, this.maxDepthTravel());
  }

  private orbitBy(deltaX: number, deltaY: number, sensitivity: number) {
    this.targetOrbitYaw += deltaX * sensitivity;
    this.targetOrbitPitch = THREE.MathUtils.clamp(
      this.targetOrbitPitch + deltaY * sensitivity,
      ThreeViewport.minOrbitPitch,
      ThreeViewport.maxOrbitPitch,
    );
    this.targetDepthTravel = Math.min(this.targetDepthTravel, this.maxDepthTravel());
    this.onViewChange(this.zoomLevel, this.targetDepthTravel, this.maxDepthTravel());
  }

  private maxDepthTravel() {
    if (!this.hasSceneItems) return 0;
    const direction = this.orbitDirection(this.targetOrbitYaw, this.targetOrbitPitch);
    const deepestDistance = this.sceneDepthPositions.reduce(
      (deepest, position) => Math.max(deepest, -position.dot(direction)),
      0,
    );
    return Math.max(0, ThreeViewport.baseCameraZ / this.zoomLevel + deepestDistance - ThreeViewport.depthFocusDistance);
  }

  private orbitDirection(yaw: number, pitch: number) {
    const horizontal = Math.cos(pitch);
    return new THREE.Vector3(
      Math.sin(yaw) * horizontal,
      Math.sin(pitch),
      Math.cos(yaw) * horizontal,
    );
  }

  private wheelPixels(delta: number, mode: number) {
    if (mode === WheelEvent.DOM_DELTA_LINE) return delta * 40;
    if (mode === WheelEvent.DOM_DELTA_PAGE) return delta * this.host.clientHeight;
    return delta;
  }

  private setZoomLevel(level: number) {
    const next = THREE.MathUtils.clamp(level, ThreeViewport.minZoom, ThreeViewport.maxZoom);
    if (Math.abs(next - this.zoomLevel) < 0.001) return;
    this.zoomLevel = next;
    this.targetDepthTravel = Math.min(this.targetDepthTravel, this.maxDepthTravel());
    this.onViewChange(next, this.targetDepthTravel, this.maxDepthTravel());
    if (!this.cameraTravelStartedAt) this.positionCamera(ThreeViewport.baseCameraZ / next, this.depthTravel);
  }

  private positionCamera(distance: number, depth: number) {
    const direction = this.orbitDirection(this.orbitYaw, this.orbitPitch);
    const target = direction.clone().multiplyScalar(-depth);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.lookAt(target);
  }

  private disposeCard(mesh: THREE.Mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
      material.dispose();
    });
  }
}
