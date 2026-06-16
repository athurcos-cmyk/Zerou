import { useRef } from 'react';
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import type { Group, Mesh } from 'three';

/** A floating 3D credit card (Sol tangerine) that gently turns toward the pointer. */
function Card() {
  const ref = useRef<Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const targetY = state.pointer.x * 0.5;
    const targetX = -state.pointer.y * 0.35;
    ref.current.rotation.y += (targetY - ref.current.rotation.y) * 0.06;
    ref.current.rotation.x += (targetX - ref.current.rotation.x) * 0.06;
  });

  return (
    <Float speed={2} rotationIntensity={0.25} floatIntensity={0.8}>
      <group ref={ref} rotation={[0.1, -0.3, 0]}>
        <RoundedBox args={[3.4, 2.15, 0.16]} radius={0.16} smoothness={6} castShadow>
          <meshStandardMaterial color="#ee5524" metalness={0.35} roughness={0.28} />
        </RoundedBox>
        {/* chip */}
        <mesh position={[-1, 0.45, 0.1]}>
          <boxGeometry args={[0.55, 0.42, 0.04]} />
          <meshStandardMaterial color="#f6c87a" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* magnetic stripe */}
        <mesh position={[0, -0.55, 0.09]}>
          <boxGeometry args={[3, 0.34, 0.02]} />
          <meshStandardMaterial color="#1c1814" metalness={0.2} roughness={0.6} />
        </mesh>
      </group>
    </Float>
  );
}

function Coin({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.z = state.clock.elapsedTime * 0.6;
  });
  return (
    <Float speed={1.5} floatIntensity={1.4} rotationIntensity={0.4}>
      <mesh ref={ref} position={position} scale={scale} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.14, 40]} />
        <meshStandardMaterial color="#f0a32a" metalness={0.85} roughness={0.25} />
      </mesh>
    </Float>
  );
}

function Light(props: ThreeElements['directionalLight']) {
  return <directionalLight {...props} />;
}

export default function WebglScene() {
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.7} />
      <Light position={[4, 6, 5]} intensity={1.6} castShadow />
      <Light position={[-5, -2, 2]} intensity={0.5} color="#ffd9a8" />
      <Card />
      <Coin position={[2.7, 1.4, -0.5]} scale={1} />
      <Coin position={[-2.9, -1.3, -0.8]} scale={0.8} />
      <Coin position={[2.4, -1.6, 0.4]} scale={0.6} />
    </Canvas>
  );
}
