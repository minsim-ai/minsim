import { requestJson } from './client'
import type { AnalyticsEventRequest, AnalyticsEventResponse } from '../types/api'

export function recordAnalyticsEvent(payload: AnalyticsEventRequest): Promise<AnalyticsEventResponse> {
  return requestJson<AnalyticsEventResponse>('/api/analytics/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
