import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import type { Group } from 'three';

/** A single interactive 3D card — the WebGL highlight inside the otherwise CSS-3D hero. */
function Card() {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const targetY = state.pointer.x * 0.6;
    const targetX = -state.pointer.y * 0.4;
    ref.current.rotation.y += (targetY - ref.current.rotation.y) * 0.07;
    ref.current.rotation.x += (targetX - ref.current.rotation.x) * 0.07;
  });
  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={1}>
      <group ref={ref} rotation={[0.12, -0.35, 0]}>
        <RoundedBox args={[3.4, 2.15, 0.16]} radius={0.16} smoothness={6}>
          <meshStandardMaterial color="#ee5524" metalness={0.35} roughness={0.28} />
        </RoundedBox>
        <mesh position={[-1, 0.45, 0.1]}>
          <boxGeometry args={[0.55, 0.42, 0.04]} />
          <meshStandardMaterial color="#f6c87a" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.55, 0.09]}>
          <boxGeometry args={[3, 0.34, 0.02]} />
          <meshStandardMaterial color="#1c1814" metalness={0.2} roughness={0.6} />
        </mesh>
      </group>
    </Float>
  );
}

export default function WebglCard() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <directionalLight position={[-5, -2, 2]} intensity={0.5} color="#ffd9a8" />
      <Card />
    </Canvas>
  );
}
