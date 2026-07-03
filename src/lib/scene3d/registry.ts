import type * as THREE from 'three';

export type Scene3DType = 'globe' | 'particles' | 'simple-cube';

export interface Scene3DColors {
  accent: string;
  primary: string;
  surface: string;
  ink: string;
}

export interface Scene3DContext {
  THREE: typeof THREE;
  scene: THREE.Scene;
  colors: Scene3DColors;
  reducedMotion: boolean;
}

export interface Scene3DInstance {
  animate?: (time: number) => void;
  dispose: () => void;
}

export type Scene3DFactory = (ctx: Scene3DContext) => Scene3DInstance;

function createSimpleCube(ctx: Scene3DContext): Scene3DInstance {
  const { THREE, scene, colors } = ctx;
  const geometry = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const material = new THREE.MeshBasicMaterial({
    color: colors.accent,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  return {
    animate(time) {
      mesh.rotation.x = time * 0.00045;
      mesh.rotation.y = time * 0.0007;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(mesh);
    },
  };
}

function createGlobe(ctx: Scene3DContext): Scene3DInstance {
  const { THREE, scene, colors } = ctx;
  const group = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.2, 2),
    new THREE.MeshBasicMaterial({ color: colors.primary, wireframe: true })
  );
  group.add(sphere);

  const latLines = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const y = i * 0.35;
    const r = Math.sqrt(Math.max(0, 1.2 * 1.2 - y * y));
    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(64).map((p) => new THREE.Vector3(p.x, y, p.y));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.55 })
    );
    latLines.add(line);
  }
  group.add(latLines);

  const lonLines = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 64; j++) {
      const t = (j / 64) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * 1.2 * Math.cos(angle), Math.sin(t) * 1.2, Math.cos(t) * 1.2 * Math.sin(angle)));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: colors.ink, transparent: true, opacity: 0.35 })
    );
    lonLines.add(line);
  }
  group.add(lonLines);

  scene.add(group);

  return {
    animate(time) {
      group.rotation.y = time * 0.00025;
      group.rotation.x = 0.35;
    },
    dispose() {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      scene.remove(group);
    },
  };
}

function createParticles(ctx: Scene3DContext): Scene3DInstance {
  const { THREE, scene, colors } = ctx;
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: colors.accent,
    size: 0.035,
    transparent: true,
    opacity: 0.85,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return {
    animate(time) {
      points.rotation.y = time * 0.00018;
      points.rotation.x = Math.sin(time * 0.0002) * 0.15;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(points);
    },
  };
}

export const scene3dRegistry: Record<Scene3DType, Scene3DFactory> = {
  'simple-cube': createSimpleCube,
  globe: createGlobe,
  particles: createParticles,
};
