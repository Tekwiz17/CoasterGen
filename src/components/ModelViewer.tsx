import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ModelData, Project } from "../types";
interface Props {
  model: ModelData | null;
  project: Project;
  bottom: boolean;
  zoom: number;
  reset: number;
  onFailure: () => void;
}
export default function ModelViewer({
  model,
  project,
  bottom,
  zoom,
  reset,
  onFailure,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
    floor: THREE.Mesh;
    render: () => void;
  } | null>(null);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      onFailure();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D coaster preview. Drag to orbit; scroll to zoom.",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 3000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 20;
    controls.maxDistance = 1000;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb6bbac, 2.5));
    const light = new THREE.DirectionalLight(0xfff8e9, 4);
    light.position.set(-80, -50, 180);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -200;
    light.shadow.camera.right = 200;
    light.shadow.camera.top = 200;
    light.shadow.camera.bottom = -200;
    light.shadow.normalBias = 0.03;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 1);
    fill.position.set(100, 100, 60);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    );
    floor.position.z = -0.3;
    floor.receiveShadow = true;
    scene.add(floor);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    state.current = { renderer, scene, camera, controls, group, floor, render };
    resize();
    const lost = (e: Event) => {
      e.preventDefault();
      onFailure();
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      observer.disconnect();
      controls.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    while (s.group.children.length) {
      const o = s.group.children[0] as THREE.Mesh;
      s.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    for (const part of model?.parts ?? []) {
      const indexed = new THREE.BufferGeometry();
      indexed.setAttribute(
        "position",
        new THREE.BufferAttribute(part.positions, 3),
      );
      indexed.setIndex(new THREE.BufferAttribute(part.indices, 1));
      const geo = indexed.toNonIndexed();
      indexed.dispose();
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: project.colors[part.colorIndex] ?? project.colors[0],
        roughness: 0.7,
        metalness: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.group.add(mesh);
    }
    s.render();
  }, [model]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    for (const m of s.group.children as THREE.Mesh[]) {
      const i = s.group.children.indexOf(m);
      const part = model?.parts[i];
      if (part)
        (m.material as THREE.MeshStandardMaterial).color.set(
          project.colors[part.colorIndex] ?? project.colors[0],
        );
    }
    s.render();
  }, [project.colors, model]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const d = project.diameter;
    const aspect = host.current!.clientWidth / host.current!.clientHeight;
    const factor = aspect < 1 ? 1 / aspect : 1;
    s.camera.position.set(
      (d * 0.64 * factor) / zoom,
      (-d * 1.15 * factor) / zoom,
      ((bottom ? -1 : 1) * d * 1.9 * factor) / zoom,
    );
    s.controls.target.set(0, 0, project.thickness / 2);
    s.floor.visible = !bottom;
    s.controls.update();
    s.render();
  }, [bottom, zoom, reset, project.diameter]);
  return <div ref={host} className="three-view" />;
}
