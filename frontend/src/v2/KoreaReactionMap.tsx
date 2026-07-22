import { useEffect, useState } from 'react'
import type { MinsimRegion } from './minsimReport'
import {
  getCountryMapConfig,
  getPathRegionCandidates,
  normalizeRegionKey,
  type CountryMapConfig,
} from './countryMapConfig'

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
  paths: { id: string; name: string; d: string; fillRule?: string }[]
}

const cache = new Map<string, ProvincePaths>()
const pending = new Map<string, Promise<ProvincePaths>>()

function loadProvincePaths(mapUrl: string): Promise<ProvincePaths> {
  const cached = cache.get(mapUrl)
  if (cached) return Promise.resolve(cached)
  const existing = pending.get(mapUrl)
  if (existing) return existing
  const request = fetch(mapUrl)
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
          name: path.getAttribute('data-shapename') ?? path.getAttribute('id') ?? '',
          d: path.getAttribute('d') ?? '',
          fillRule: path.getAttribute('fill-rule') ?? undefined,
        }))
        .filter((path) => path.id && path.d)
      const data = { viewBox: svg?.getAttribute('viewBox') ?? '0 0 800 759', paths }
      cache.set(mapUrl, data)
      return data
    })
    .finally(() => {
      pending.delete(mapUrl)
    })
  pending.set(mapUrl, request)
  return request
}

function useProvincePaths(mapUrl: string | null) {
  const cached = mapUrl ? cache.get(mapUrl) ?? null : null
  const [state, setState] = useState<{ data: ProvincePaths | null; loading: boolean; error: boolean }>({
    data: cached,
    loading: Boolean(mapUrl && !cached),
    error: !mapUrl,
  })
  useEffect(() => {
    let alive = true
    if (!mapUrl) {
      setState({ data: null, loading: false, error: true })
      return
    }
    const current = cache.get(mapUrl)
    if (current) {
      setState({ data: current, loading: false, error: false })
      return
    }
    setState({ data: null, loading: true, error: false })
    loadProvincePaths(mapUrl)
      .then((data) => {
        if (alive) setState({ data, loading: false, error: false })
      })
      .catch(() => {
        if (alive) setState({ data: null, loading: false, error: true })
      })
    return () => {
      alive = false
    }
  }, [mapUrl])
  return state
}

function regionLookup(regions: MinsimRegion[]): Map<string, MinsimRegion> {
  const lookup = new Map<string, MinsimRegion>()
  regions.forEach((region) => {
    for (const value of [region.name, region.svgId]) {
      const key = normalizeRegionKey(value)
      if (key) lookup.set(key, region)
    }
  })
  return lookup
}

function resolvePathRegion(
  path: ProvincePaths['paths'][number],
  lookup: Map<string, MinsimRegion>,
  config: CountryMapConfig,
): MinsimRegion | undefined {
  for (const value of getPathRegionCandidates(config, path.id, path.name)) {
    const region = lookup.get(normalizeRegionKey(value))
    if (region) return region
  }
  return undefined
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

export function InteractiveCountryMap({
  regions,
  selectedRegion,
  onSelect,
  legend,
  metricLabel = '반응률',
  label,
  countryId = 'kr',
}: {
  regions: MinsimRegion[]
  selectedRegion: MinsimRegion | null
  onSelect: (region: MinsimRegion) => void
  legend?: RegionOutcomeLegend[]
  metricLabel?: string
  label?: string
  countryId?: string
}) {
  const mapConfig = getCountryMapConfig(countryId)
  const mapLabel = label ?? `${mapConfig?.countryNameKo ?? countryId.toUpperCase()} 행정구역 반응 지도`
  const { data, loading, error } = useProvincePaths(mapConfig?.mapUrl ?? null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const lookup = regionLookup(regions)
  const regionForPath = (path: ProvincePaths['paths'][number]) => (
    mapConfig ? resolvePathRegion(path, lookup, mapConfig) : undefined
  )
  const selectedId = data?.paths.find((path) => regionForPath(path)?.name === selectedRegion?.name)?.id ?? null

  const hoverRegion = hoveredId && data
    ? regionForPath(data.paths.find((path) => path.id === hoveredId) ?? data.paths[0])
    : null
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
        {mapConfig && (
          <img src={mapConfig.mapUrl} alt={mapLabel} style={{ height: '100%', width: 'auto', maxWidth: '100%', opacity: 0.82 }} />
        )}
        <span className="ph-sub" style={{ position: 'absolute', bottom: 10, right: 14 }}>
          {mapConfig ? '지도 로드 실패 · 정적 SVG 표시' : '지원되지 않는 국가 지도입니다'}
        </span>
      </div>
    )
  }

  const paths = data.paths.slice().sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0))

  const labeledRegions = countryId === 'kr' ? regions.filter((region) => {
    const id = region.svgId || region.name
    return KOREA_REGION_LABEL_POS[id] && (region.n >= 30 || id === selectedId || id === hoveredId)
  }) : []

  return (
    <div className="region-map-shell">
      <svg viewBox={data.viewBox} role="group" aria-label={mapLabel} className="region-map-svg">
        <g>
          {paths.map((path) => {
            const region = regionForPath(path)
            const choiceId = regionChoiceId(region)
            const selected = path.id === selectedId
            const hovered = path.id === hoveredId
            const disabled = !region
            const strokeColor = selected ? colorFor(choiceId) : hovered ? 'var(--fg)' : 'var(--border)'
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
        {mapConfig?.sourceUrl ? (
          <>
            <a href={mapConfig.sourceUrl} target="_blank" rel="noreferrer" className="faint">
              경계: {mapConfig.sourceLabel}
            </a>
            <a href="/maps/ATTRIBUTION.md" target="_blank" rel="noreferrer" className="faint">
              지도 출처·라이선스
            </a>
          </>
        ) : mapConfig ? (
          <span className="faint">경계: {mapConfig.sourceLabel}</span>
        ) : null}
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

export const InteractiveKoreaMap = InteractiveCountryMap
