/** Particle-m monogram used in headers and chat chrome. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <span className="dot brand-mark" aria-hidden="true">
      <img
        src="/logo-mark.png"
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
    </span>
  )
}
