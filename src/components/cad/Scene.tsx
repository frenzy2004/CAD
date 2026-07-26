"use client";

import { Bounds, Edges, OrbitControls, useBounds } from "@react-three/drei";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import * as THREE from "three";

import type { ProjectedFeatureAnchor } from "@/lib/cad/projection";
import type { CadMesh } from "@/lib/cad/worker-protocol";

const CAMERA = {
  position: [120, 100, 100] as [number, number, number],
  fov: 42,
  near: 0.1,
  far: 10_000,
};
const DEVICE_PIXEL_RATIO: [number, number] = [1, 2];
const GL_OPTIONS = {
  antialias: true,
  alpha: false,
};

export interface SceneProps {
  mesh: CadMesh;
  selectedFeatureId: string | null;
  drawing: boolean;
  onOrbitControlsChange(controls: OrbitControlsState | null): void;
  onProjectedAnchorsChange(
    anchors: readonly ProjectedFeatureAnchor[],
  ): void;
}

export interface OrbitControlsState {
  enabled: boolean;
}

interface CadModelProps {
  geometry: THREE.BufferGeometry;
}

interface FitToViewProps {
  bounds: CadMesh["bounds"];
}

interface FeatureProjectionProps {
  anchors: CadMesh["holeAnchors"];
  onChange(anchors: readonly ProjectedFeatureAnchor[]): void;
}

interface SelectedFeatureHighlightProps {
  anchor: CadMesh["holeAnchors"][number] | null;
}

function CadModel({ geometry }: CadModelProps) {
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#a5b4c7"
        metalness={0.22}
        roughness={0.52}
      />
      <Edges geometry={geometry} color="#172033" threshold={24} />
    </mesh>
  );
}

function FitToView({ bounds: meshBounds }: FitToViewProps) {
  const bounds = useBounds();
  const box = useMemo(
    () =>
      new THREE.Box3(
        new THREE.Vector3(
          meshBounds.min.x,
          meshBounds.min.y,
          meshBounds.min.z,
        ),
        new THREE.Vector3(
          meshBounds.max.x,
          meshBounds.max.y,
          meshBounds.max.z,
        ),
      ),
    [
      meshBounds.max.x,
      meshBounds.max.y,
      meshBounds.max.z,
      meshBounds.min.x,
      meshBounds.min.y,
      meshBounds.min.z,
    ],
  );

  useLayoutEffect(() => {
    bounds.refresh(box).fit().clip();
  }, [bounds, box]);

  return null;
}

function FeatureProjection({ anchors, onChange }: FeatureProjectionProps) {
  const scratch = useMemo(
    () => ({
      cameraDirection: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(),
      projectedPoint: new THREE.Vector3(),
      toAnchor: new THREE.Vector3(),
      worldPoint: new THREE.Vector3(),
    }),
    [],
  );
  const previousSignature = useRef("");

  useFrame(({ camera, size }) => {
    const projected: ProjectedFeatureAnchor[] = [];
    camera.getWorldPosition(scratch.cameraPosition);
    camera.getWorldDirection(scratch.cameraDirection);

    for (const anchor of anchors) {
      scratch.worldPoint.set(
        anchor.pointMm.x,
        anchor.pointMm.y,
        anchor.pointMm.z,
      );
      scratch.toAnchor
        .copy(scratch.worldPoint)
        .sub(scratch.cameraPosition);
      if (scratch.toAnchor.dot(scratch.cameraDirection) <= 0) continue;

      scratch.projectedPoint.copy(scratch.worldPoint).project(camera);

      if (
        scratch.projectedPoint.z < -1 ||
        scratch.projectedPoint.z > 1 ||
        !Number.isFinite(scratch.projectedPoint.x) ||
        !Number.isFinite(scratch.projectedPoint.y)
      ) {
        continue;
      }

      projected.push({
        featureId: anchor.featureId,
        screenPoint: {
          x: ((scratch.projectedPoint.x + 1) * size.width) / 2,
          y: ((1 - scratch.projectedPoint.y) * size.height) / 2,
        },
        pointMm: anchor.pointMm,
        diameterMm: anchor.diameterMm,
      });
    }

    const signature = projected
      .map(
        (anchor) =>
          [
            anchor.featureId,
            anchor.screenPoint.x.toFixed(3),
            anchor.screenPoint.y.toFixed(3),
            anchor.pointMm.x,
            anchor.pointMm.y,
            anchor.pointMm.z,
            anchor.diameterMm,
          ].join(":"),
      )
      .join("|");

    if (signature === previousSignature.current) return;
    previousSignature.current = signature;
    onChange(projected);
  });

  return null;
}

function SelectedFeatureHighlight({
  anchor,
}: SelectedFeatureHighlightProps) {
  if (anchor === null) return null;

  const radius = Math.max(anchor.diameterMm / 2 + 0.8, 1.4);
  const { x, y, z } = anchor.pointMm;

  return (
    <mesh position={[x, y, z]} renderOrder={10}>
      <sphereGeometry args={[radius, 24, 16]} />
      <meshBasicMaterial
        color="#fbbf24"
        depthTest={false}
        depthWrite={false}
        opacity={0.42}
        transparent
        wireframe
      />
    </mesh>
  );
}

function ViewportFallback(): ReactNode {
  return (
    <div
      className="grid h-full w-full place-items-center bg-slate-950 text-sm text-slate-300"
      role="status"
    >
      This browser cannot display the 3D CAD viewport.
    </div>
  );
}

function configureZUpCamera({ camera }: RootState) {
  camera.up.set(0, 0, 1);
}

export function Scene({
  mesh,
  selectedFeatureId,
  drawing,
  onOrbitControlsChange,
  onProjectedAnchorsChange,
}: SceneProps) {
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(mesh.positions, 3),
    );
    nextGeometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(mesh.normals, 3),
    );
    nextGeometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    nextGeometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(
        mesh.bounds.min.x,
        mesh.bounds.min.y,
        mesh.bounds.min.z,
      ),
      new THREE.Vector3(
        mesh.bounds.max.x,
        mesh.bounds.max.y,
        mesh.bounds.max.z,
      ),
    );
    nextGeometry.boundingSphere =
      nextGeometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    return nextGeometry;
  }, [mesh]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const selectedAnchor =
    mesh.holeAnchors.find(
      (anchor) => anchor.featureId === selectedFeatureId,
    ) ?? null;
  const width = mesh.bounds.max.x - mesh.bounds.min.x;
  const depth = mesh.bounds.max.y - mesh.bounds.min.y;
  const height = mesh.bounds.max.z - mesh.bounds.min.z;
  const gridSize = Math.max(width, depth, height, 10) * 1.4;
  const axesSize = Math.max(gridSize * 0.16, 8);
  const gridCenter: [number, number, number] = [
    (mesh.bounds.min.x + mesh.bounds.max.x) / 2,
    (mesh.bounds.min.y + mesh.bounds.max.y) / 2,
    mesh.bounds.min.z - Math.max(height * 0.025, 0.1),
  ];

  return (
    <Canvas
      aria-label="Interactive CAD model"
      camera={CAMERA}
      className="h-full w-full"
      dpr={DEVICE_PIXEL_RATIO}
      fallback={<ViewportFallback />}
      gl={GL_OPTIONS}
      onCreated={configureZUpCamera}
      shadows
    >
      <color attach="background" args={["#0b1220"]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#e0f2fe", "#111827", 1.25]} />
      <directionalLight
        castShadow
        intensity={2.6}
        position={[120, 150, 180]}
      />
      <directionalLight intensity={1.15} position={[-100, -80, 90]} />

      <OrbitControls
        dampingFactor={0.08}
        enabled={!drawing}
        enableDamping
        makeDefault
        maxDistance={gridSize * 8}
        minDistance={Math.max(gridSize * 0.08, 1)}
        ref={onOrbitControlsChange}
      />
      <Bounds clip fit margin={1.25} observe>
        <group>
          <CadModel geometry={geometry} />
          <SelectedFeatureHighlight anchor={selectedAnchor} />
          <FitToView bounds={mesh.bounds} />
        </group>
      </Bounds>

      <gridHelper
        args={[gridSize, 20, "#475569", "#1e293b"]}
        position={gridCenter}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <axesHelper args={[axesSize]} position={gridCenter} />
      <FeatureProjection
        anchors={mesh.holeAnchors}
        onChange={onProjectedAnchorsChange}
      />
    </Canvas>
  );
}
