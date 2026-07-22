import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function PopulationOrb() {
  const mesh = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.x += delta * 0.16;
    mesh.current.rotation.y += delta * 0.22;
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.45, 2]} />
      <meshStandardMaterial color="#5B8CFF" roughness={0.35} metalness={0.12} />
    </mesh>
  );
}

function SceneCanvas() {
  return (
    <Canvas camera={{ position: [0, 0, 4.4], fov: 45 }}>
      <ambientLight intensity={1.9} />
      <directionalLight position={[3, 2, 4]} intensity={2.1} />
      <PopulationOrb />
    </Canvas>
  );
}

export default SceneCanvas;
