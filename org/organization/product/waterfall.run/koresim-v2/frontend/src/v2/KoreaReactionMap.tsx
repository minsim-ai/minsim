import { useEffect, useState } from 'react'
import type { MinsimRegion } from './minsimReport'

const KOREA_MAP_URL = '/maps/korea-provinces.svg'

const OPT: Record<string, string> = {
  A: 'var(--opt-a)',
  B: 'var(--opt-b)',
  C: 'var(--opt-c)',
  D: 'var(--opt-d)',
  유지: 'var(--segment-retain)',
  관망: 'var(--segment-watch)',
  이탈: 'var(--segment-churn)',
}

export type RegionOutcomeLegend = { id: string; label: string; color: string }

const KOREA_REGION_LABEL_POS: Record<string, [number, number]> = {
  서울특별시: [251, 153],
  부산광역시: [487, 493],
  대구광역시: [432, 394],
  인천광역시: [174, 153],
  광주광역시: [238, 478],
  대전광역시: [309, 324],
  울산광역시: [556, 430],
  세종특별자치시: [295, 368],
  경기도: [276, 230],
  강원도: [444, 174],
  충청북도: [354, 298],
  충청남도: [247, 362],
  전라북도: [268, 462],
  전라남도: [248, 600],
  경상북도: [500, 330],
  경상남도: [455, 512],
  제주특별자치도: [211, 725],
}

type ProvincePaths = {
  viewBox: string
  paths: { id: string; d: string; fillRule?: string }[]
}

let cache: ProvincePaths | null = null
let pending: Promise<ProvincePaths> | null = null

function loadProvincePaths(): Promise<ProvincePaths> {
  if (cache) return Promise.resolve(cache)
  if (pending) return pending
  pending = fetch(KOREA_MAP_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`지도 SVG 로드 실패: ${res.status}`)
      return res.text()
    })
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
      const svg = doc.querySelector('svg')
      const paths = Array.from(doc.querySelectorAll('path[id]'))
        .map((path) => ({
          id: path.getAttribute('id') ?? '',
          d: path.getAttribute('d') ?? '',
          fillRule: path.getAttribute('fill-rule') ?? undefined,
        }))
        .filter((path) => path.id && path.d)
      cache = { viewBox: svg?.getAttribute('viewBox') ?? '0 0 800 759', paths }
      return cache
    })
  return pending
}

function useProvincePaths() {
  const [state, setState] = useState<{ data: ProvincePaths | null; loading: boolean; error: boolean }>({
    data: cache,
    loading: !cache,
    error: false,
  })
  useEffect(() => {
    let alive = true
    if (cache) return
    setState({ data: null, loading: true, error: false })
    loadProvincePaths()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: false })
      })
      .catch(() => {
        if (alive) setState({ data: null, loading: false, error: true })
      })
    return () => {
      alive = false
    }
  }, [])
  return state
}

function regionChoiceId(region: MinsimRegion | null | undefined): string {
  return String(region?.leadId ?? '').trim() || 'B'
}

function regionFillOpacity(region: MinsimRegion | undefined, selected: boolean, hovered: boolean): number {
  if (!region) return 0.12
  const pct = region.focusPct
  const base = Math.max(0.28, Math.min(0.84, 0.2 + (pct / 100) * 0.62))
  const samplePenalty = region.n < 30 ? -0.09 : 0
  const focusBoost = selected || hovered ? 0.12 : 0
  return Math.max(0.18, Math.min(0.92, base + samplePenalty + focusBoost))
}

export function InteractiveKoreaMap({
  regions,
  selectedRegion,
  onSelect,
  legend,
  metricLabel = '반응률',
  label = '대한민국 시도 반응 지도',
}: {
  regions: MinsimRegion[]
  selectedRegion: MinsimRegion | null
  onSelect: (region: MinsimRegion) => void
  legend?: RegionOutcomeLegend[]
  metricLabel?: string
  label?: string
}) {
  const { data, loading, error } = useProvincePaths()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const selectedId = selectedRegion?.svgId ?? null
  const bySvgId: Record<string, MinsimRegion> = {}
  regions.forEach((region) => {
    bySvgId[region.svgId || region.name] = region
  })

  const hoverRegion = hoveredId ? bySvgId[hoveredId] : null
  const preview = hoverRegion ?? selectedRegion ?? regions[0]
  const activeLegend = legend?.length
    ? legend
    : ['A', 'B', 'C', 'D'].map((id) => ({ id, label: `${id}안`, color: OPT[id] }))
  const palette = Object.fromEntries(activeLegend.map((item) => [item.id, item.color]))
  const colorFor = (id: string) => palette[id] ?? OPT[id] ?? 'var(--opt-d)'

  if (loading) {
    return (
      <div className="region-map-shell region-map-loading">
        <span className="lbl-mono">행정경계 SVG 불러오는 중</span>
      </div>
    )
  }

  if (error || !data || !data.paths.length) {
    return (
      <div className="region-map-shell region-map-fallback">
        <img src={KOREA_MAP_URL} alt={label} style={{ height: '100%', width: 'auto', maxWidth: '100%', opacity: 0.82 }} />
        <span className="ph-sub" style={{ position: 'absolute', bottom: 10, right: 14 }}>
          지도 로드 실패 · 정적 SVG 표시
        </span>
      </div>
    )
  }

  const paths = data.paths.slice().sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0))

  const labeledRegions = regions.filter((region) => {
    const id = region.svgId || region.name
    return KOREA_REGION_LABEL_POS[id] && (region.n >= 30 || id === selectedId || id === hoveredId)
  })

  return (
    <div className="region-map-shell">
      <svg viewBox={data.viewBox} role="group" aria-label={label} className="region-map-svg">
        <g>
          {paths.map((path) => {
            const region = bySvgId[path.id]
            const choiceId = regionChoiceId(region)
            const selected = path.id === selectedId
            const hovered = path.id === hoveredId
            const disabled = !region
            const strokeColor = selected ? colorFor(choiceId) : hovered ? 'var(--fg)' : 'var(--surface)'
            return (
              <path
                key={path.id}
                d={path.d}
                fillRule={path.fillRule as 'evenodd' | 'nonzero' | undefined}
                fill={region ? colorFor(choiceId) : 'var(--surface-3)'}
                fillOpacity={regionFillOpacity(region, selected, hovered)}
                stroke={strokeColor}
                strokeWidth={selected ? 3.1 : hovered ? 2.1 : 1.15}
                vectorEffect="non-scaling-stroke"
                role={disabled ? 'presentation' : 'button'}
                tabIndex={disabled ? -1 : 0}
                aria-label={region ? `${region.name}, 대표 반응 ${region.lead}, ${metricLabel} ${region.focusPct}%, ${region.n}명, 신뢰 ${region.reliability}` : undefined}
                onMouseEnter={() => setHoveredId(path.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(path.id)}
                onBlur={() => setHoveredId(null)}
                onClick={region ? () => onSelect(region) : undefined}
                onKeyDown={region ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(region)
                  }
                } : undefined}
                style={{ cursor: disabled ? 'default' : 'pointer', transition: 'fill-opacity .14s ease, stroke .14s ease' }}
              >
                <title>{region ? `${region.name} · ${metricLabel} ${region.focusPct}% · ${region.n}명 · 신뢰 ${region.reliability}` : path.id}</title>
              </path>
            )
          })}
        </g>

        <g pointerEvents="none">
          {labeledRegions.map((region) => {
            const id = region.svgId || region.name
            const [x, y] = KOREA_REGION_LABEL_POS[id]
            return (
              <text
                key={id}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="region-map-label"
                style={{ paintOrder: 'stroke' }}
              >
                <tspan x={x} dy="-4">
                  {compactRegionName(region.name)}
                </tspan>
                <tspan x={x} dy="14" fill={colorFor(region.leadId)}>
                  {region.focusLabel} {Math.round(region.focusPct)}%
                </tspan>
              </text>
            )
          })}
        </g>
      </svg>

      <div className="region-map-tip">
        {preview ? (
          <>
            <span className="lbl-mono">선택/호버</span>
            <strong>{preview.name}</strong>
            <span>
              {metricLabel} {preview.focusPct}% · {preview.n}명 · 신뢰 {preview.reliability}
            </span>
          </>
        ) : (
          <span className="lbl-mono">지역에 마우스를 올리거나 눌러보세요</span>
        )}
      </div>

      <div className="region-map-legend">
        {activeLegend.map((item) => (
          <span key={item.id}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="faint">색=대표 반응 · 진하기={metricLabel} · 외곽선=선택</span>
      </div>
    </div>
  )
}

function compactRegionName(name: string): string {
  return name
    .replace('특별자치도', '')
    .replace('특별자치시', '')
    .replace('광역시', '')
    .replace('특별시', '')
    .replace(/도$/, '')
}
