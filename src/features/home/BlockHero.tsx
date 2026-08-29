import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import type { Group, Mesh } from 'three'

/**
 * Two clusters of blocks drifting toward each other and settling together —
 * the product's whole thesis in one object. Landing page only, lazy-loaded,
 * and never mounted when the viewer prefers reduced motion.
 */

const PALETTE = ['#4F42C0', '#F2B44E', '#6C60D4', '#FBF7F0', '#8F86E1']

type Spec = { pos: [number, number, number]; color: string; scale: number; phase: number }

function Block({ spec }: { spec: Spec }) {
  const ref = useRef<Mesh>(null)
  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const t = state.clock.elapsedTime
    // Drift toward the resting position, then breathe gently around it.
    const settle = Math.min(1, t / 3)
    m.position.x = spec.pos[0] * (1 + (1 - settle) * 1.6)
    m.position.y = spec.pos[1] + Math.sin(t * 0.7 + spec.phase) * 0.09
    m.position.z = spec.pos[2] * (1 + (1 - settle) * 1.2)
    m.rotation.x = Math.sin(t * 0.25 + spec.phase) * 0.16 + (1 - settle) * 0.9
    m.rotation.y = Math.cos(t * 0.2 + spec.phase) * 0.2 + (1 - settle) * 1.2
  })
  return (
    <RoundedBox
      ref={ref}
      args={[spec.scale, spec.scale, spec.scale]}
      radius={0.09}
      smoothness={4}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={spec.color} roughness={0.42} metalness={0.06} />
    </RoundedBox>
  )
}

function Cluster() {
  const group = useRef<Group>(null)
  const specs = useMemo<Spec[]>(() => {
    const out: Spec[] = []
    const grid: [number, number, number][] = [
      [-1.1, 0.55, 0], [-0.35, 0.55, 0], [-1.1, -0.2, 0], [-0.35, -0.2, 0.35],
      [1.1, 0.55, 0], [0.35, 0.55, 0.35], [1.1, -0.2, 0], [0.35, -0.2, 0],
      [-0.72, 1.3, 0.2], [0.72, 1.3, -0.2], [0, -0.95, 0.1],
    ]
    grid.forEach((pos, i) => {
      out.push({
        pos,
        color: PALETTE[i % PALETTE.length],
        scale: 0.66 + (i % 3) * 0.05,
        phase: i * 1.7,
      })
    })
    return out
  }, [])

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.16) * 0.42
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.11) * 0.1
    }
  })

  return (
    <group ref={group}>
      {specs.map((s, i) => (
        <Block key={i} spec={s} />
      ))}
    </group>
  )
}

export default function BlockHero() {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 5.4], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 6, 4]} intensity={1.5} castShadow />
      <directionalLight position={[-4, -2, -3]} intensity={0.45} color="#F2B44E" />
      <pointLight position={[0, 3, 3]} intensity={22} color="#FBF7F0" />
      <Cluster />
    </Canvas>
  )
}
