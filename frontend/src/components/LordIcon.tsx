import { useEffect, useState } from 'react'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX intrinsic augmentation requires a namespace
  namespace JSX {
    interface IntrinsicElements {
      'lord-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        trigger?: string
        colors?: string
        delay?: string | number
      }
    }
  }
}

let definePromise: Promise<void> | null = null

function ensureElement(): Promise<void> {
  if (!definePromise) {
    definePromise = Promise.all([import('lottie-web'), import('lord-icon-element')]).then(
      ([lottie, { defineElement }]) => {
        if (!window.customElements.get('lord-icon')) {
          defineElement(lottie.default.loadAnimation)
        }
      },
    )
  }
  return definePromise
}

interface LordIconProps {
  src: string
  size?: number
  trigger?: 'hover' | 'click' | 'loop' | 'loop-on-hover' | 'morph' | 'boomerang'
  colors?: string
  className?: string
}

export function LordIcon({
  src,
  size = 44,
  trigger = 'loop-on-hover',
  colors = 'primary:#7FA8FF,secondary:#5B8CFF',
  className,
}: LordIconProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    ensureElement().then(() => {
      if (mounted) setReady(true)
    })
    return () => {
      mounted = false
    }
  }, [])

  const style = { width: size, height: size, display: 'inline-block' } as const

  if (!ready) {
    return <span className={className} style={style} aria-hidden="true" />
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <lord-icon
      src={src}
      trigger={reducedMotion ? undefined : trigger}
      colors={colors}
      className={className}
      style={style}
      aria-hidden="true"
    />
  )
}
