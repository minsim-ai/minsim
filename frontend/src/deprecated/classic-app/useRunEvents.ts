import { useEffect, useState } from 'react'
import { getRun } from '../api/runs'
import type { RunEventType, RunSnapshot } from '../types/api'

const RUN_EVENT_TYPES: RunEventType[] = [
  'snapshot',
  'created',
  'queued',
  'running',
  'progress',
  'partial_result',
  'completed',
  'failed',
  'interrupted',
  'canceled',
  'heartbeat',
]

type RunEventPayload = {
  run_id: string
  event_id?: string
  event_type: RunEventType
  created_at?: string
  payload?: {
    snapshot?: RunSnapshot
  } & Record<string, unknown>
}

function isTerminal(snapshot: RunSnapshot | null) {
  return ['completed', 'failed', 'interrupted', 'canceled'].includes(snapshot?.status ?? '')
}

export function useRunEvents(runId: string | null, enabled = true) {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [lastEvent, setLastEvent] = useState<RunEventPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId || !enabled) return

    let cancelled = false
    let source: EventSource | null = null
    let pollingId: number | null = null
    let lastEventId: string | null = null

    const fetchSnapshot = async () => {
      const next = await getRun(runId)
      if (!cancelled) setSnapshot(next)
      return next
    }

    const startPolling = () => {
      if (pollingId !== null) return
      pollingId = window.setInterval(() => {
        fetchSnapshot()
          .then((next) => {
            if (isTerminal(next) && pollingId !== null) {
              window.clearInterval(pollingId)
              pollingId = null
            }
          })
          .catch((err) => {
            if (!cancelled) setError(err instanceof Error ? err.message : String(err))
          })
      }, 2000)
    }

    getRun(runId)
      .then((next) => {
        if (!cancelled) setSnapshot(next)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })

    source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`)

    const handleEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as RunEventPayload
        if (payload.event_id) lastEventId = payload.event_id
        setLastEvent(payload)
        if (payload.event_type === 'snapshot' && payload.payload?.snapshot) {
          setSnapshot(payload.payload.snapshot)
          return
        }
        if (payload.event_type !== 'heartbeat') {
          fetchSnapshot().then((next) => {
            if (isTerminal(next)) source?.close()
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    RUN_EVENT_TYPES.forEach((eventType) => {
      source.addEventListener(eventType, handleEvent as EventListener)
    })
    source.onerror = () => {
      setError(
        lastEventId
          ? 'SSE connection dropped. Recovering with polling fallback.'
          : 'SSE connection failed. Recovering with polling fallback.'
      )
      source?.close()
      startPolling()
    }

    return () => {
      cancelled = true
      source?.close()
      if (pollingId !== null) window.clearInterval(pollingId)
    }
  }, [runId, enabled])

  return { snapshot, lastEvent, error }
}
