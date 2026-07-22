import { useEffect, useState } from 'react'
import ParticleField from './ParticleField'

function useParticleCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const isCoarse = window.matchMedia('(pointer: coarse)').matches
    const cores = navigator.hardwareConcurrency ?? 4
    let c = 90_000
    if (isMobile || isCoarse) c = 35_000
    if (cores <= 4 && !isMobile) c = 65_000
    setCount(c)
  }, [])
  return count
}

export function HeroParticleField() {
  const count = useParticleCount()
  const [interaction, setInteraction] = useState(0.35)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) setInteraction(0)
  }, [])

  if (count === 0) return null

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ParticleField count={count} interactionStrength={interaction} staticMode={false} />
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          background: 'var(--hero-particle-vignette)',
        }}
      />
    </div>
  )
}
