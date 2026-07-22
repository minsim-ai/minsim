import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { generateFormation, type FormationKind } from './formations'

const CLOUD_HOLD_MS = 4200
const MORPH_MS = 1600

function ParticleSystem({
  count,
  interactionStrength,
  staticMode,
}: {
  count: number
  interactionStrength: number
  staticMode: boolean
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const { size, viewport, gl } = useThree()
  const mouseTarget = useRef(new THREE.Vector2(999, 999))
  const mouseSmooth = useRef(new THREE.Vector2(999, 999))

  const geometry = useMemo(() => {
    const formations: Record<FormationKind, Float32Array> = {
      cloud: generateFormation('cloud', count),
      crowd: generateFormation('crowd', count),
    }
    const geom = new THREE.BufferGeometry()
    const initA = staticMode ? formations.crowd : formations.cloud
    const initB = formations.crowd
    geom.setAttribute('positionA', new THREE.BufferAttribute(initA, 3))
    geom.setAttribute('positionB', new THREE.BufferAttribute(initB, 3))
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) seeds[i] = Math.random()
    geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geom.setAttribute('position', new THREE.BufferAttribute(initA, 3))
    return geom
  }, [count, staticMode])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: staticMode ? 0 : 0 },
      uPhaseMix: { value: staticMode ? 1 : 0 },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uMouseStrength: { value: staticMode ? 0 : interactionStrength },
      uSize: { value: 2.75 },
      uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
      uViewportH: { value: viewport.height },
      uStatic: { value: staticMode ? 1 : 0 },
    }),
    [gl, viewport.height, interactionStrength, staticMode]
  )

  const phaseStart = useRef(performance.now())
  const phase = useRef<'cloud-hold' | 'morph' | 'done'>('cloud-hold')

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      mouseTarget.current.set((x * viewport.width) / 2, (y * viewport.height) / 2)
    }
    const onLeave = () => mouseTarget.current.set(999, 999)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [gl, viewport.width, viewport.height])

  useFrame((_, delta) => {
    if (staticMode) return
    const t = performance.now()
    uniforms.uTime.value += delta

    mouseSmooth.current.lerp(mouseTarget.current, 0.12)
    uniforms.uMouse.value.copy(mouseSmooth.current)

    const elapsed = t - phaseStart.current
    if (phase.current === 'cloud-hold') {
      uniforms.uProgress.value = 0
      uniforms.uPhaseMix.value = 0
      if (elapsed >= CLOUD_HOLD_MS) {
        phase.current = 'morph'
        phaseStart.current = t
      }
    } else if (phase.current === 'morph') {
      const p = Math.min(1, elapsed / MORPH_MS)
      uniforms.uProgress.value = p
      uniforms.uPhaseMix.value = p
      if (p >= 1) {
        phase.current = 'done'
        uniforms.uProgress.value = 1
        uniforms.uPhaseMix.value = 1
      }
    }
    // 'done' phase: progress locked at 1, no further updates needed beyond drift via uTime

    if (pointsRef.current && phase.current !== 'done') {
      // rotation only while in cloud/morph; tapers to 0 as morph completes (mix=1)
      const cloudActive = 1 - uniforms.uPhaseMix.value
      pointsRef.current.rotation.y += delta * 0.18 * cloudActive
    }
  })

  useEffect(() => {
    uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2)
    uniforms.uViewportH.value = viewport.height
  }, [size.width, size.height, gl, viewport.height, uniforms])

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </points>
  )
}

const vertexShader = /* glsl */ `
  attribute vec3 positionA;
  attribute vec3 positionB;
  attribute float aSeed;

  uniform float uTime;
  uniform float uProgress;
  uniform float uPhaseMix;
  uniform vec2 uMouse;
  uniform float uMouseStrength;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uViewportH;
  uniform float uStatic;

  varying float vAlpha;
  varying float vSeed;
  varying float vPhase;

  float easeInOut(float x) {
    return x * x * (3.0 - 2.0 * x);
  }

  // per-particle stagger so points arrive at the formation at different times
  const float MAX_DELAY = 0.35;

  void main() {
    float delay = aSeed * MAX_DELAY;
    float localP = clamp((uProgress - delay) / (1.0 - MAX_DELAY), 0.0, 1.0);
    float t = easeInOut(localP);
    vec3 pos = mix(positionA, positionB, t);

    float wob = aSeed * 6.2831853;
    float driftMul = 1.0 - uStatic;
    pos.x += sin(uTime * 0.6 + wob) * 0.025 * driftMul;
    pos.y += cos(uTime * 0.7 + wob * 1.3) * 0.025 * driftMul;
    pos.z += sin(uTime * 0.5 + wob * 0.7) * 0.018 * driftMul;

    vec2 toMouse = pos.xy - uMouse;
    float d = length(toMouse);
    float radius = 0.55;
    if (d < radius && uMouseStrength > 0.0) {
      float push = (1.0 - d / radius);
      pos.xy += normalize(toMouse) * push * uMouseStrength * 0.18;
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float formationBoost = mix(0.85, 1.55, uPhaseMix);
    float sizeBase = uSize * uPixelRatio * formationBoost;
    gl_PointSize = sizeBase * (1.6 / max(0.1, -mv.z));

    float twinkle = mix(0.5 + 0.5 * sin(uTime * 1.4 + wob * 2.0), 1.0, uStatic);
    float cloudAlpha = 0.40 + 0.50 * twinkle;
    float formationAlpha = 0.92 + 0.08 * twinkle;
    vAlpha = mix(cloudAlpha, formationAlpha, uPhaseMix);
    vSeed = aSeed;
    vPhase = uPhaseMix;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vSeed;
  varying float vPhase;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float falloff = mix(smoothstep(0.5, 0.05, d), smoothstep(0.5, 0.2, d), vPhase);
    float a = falloff * vAlpha;
    vec3 blueA = vec3(0.0, 0.4, 1.0);
    vec3 blueB = vec3(0.2, 0.52, 1.0);
    gl_FragColor = vec4(mix(blueA, blueB, vSeed), a * 0.82);
  }
`

export default function ParticleField({
  count,
  interactionStrength,
  staticMode = false,
}: {
  count: number
  interactionStrength: number
  staticMode?: boolean
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return null
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.2], fov: 50, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
      frameloop={staticMode ? 'demand' : 'always'}
    >
      <ParticleSystem count={count} interactionStrength={interactionStrength} staticMode={staticMode} />
    </Canvas>
  )
}
