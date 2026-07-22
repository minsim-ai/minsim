import type { ErrorResponse, RunStatus } from '../types/api'

export type TerminalRunCopy = {
  title: string
  reasonLabel: string
  reason: string
  nextStep: string
  detail: string | null
  code: string | null
}

const ERROR_REASON_BY_CODE: Partial<Record<ErrorResponse['code'], string>> = {
  LLM_TIMEOUT: 'AI 응답 생성 시간이 제한을 넘었습니다.',
  LLM_UNAVAILABLE: '현재 AI 응답 서비스를 사용할 수 없습니다.',
  NO_PERSONAS_MATCH_FILTER: '설정한 조건에 맞는 페르소나 표본을 찾지 못했습니다.',
  WORKER_INTERRUPTED: '응답을 수집하던 작업 프로세스가 완료 전에 중단되었습니다.',
  QUEUE_UNAVAILABLE: '실행 대기열에 연결할 수 없습니다.',
  PARSING_FAILED: '수집한 응답을 결과 형식으로 정리하지 못했습니다.',
}

export function terminalRunCopy(status: RunStatus, error?: ErrorResponse | null): TerminalRunCopy {
  const canceled = status === 'canceled'
  const interrupted = status === 'interrupted'
  const mappedReason = error?.code ? ERROR_REASON_BY_CODE[error.code] : null
  const detail = error?.message?.trim() || null

  return {
    title: canceled ? '실행이 취소되었습니다' : interrupted ? '실행이 중단되었습니다' : '실행에 실패했습니다',
    reasonLabel: canceled ? '취소 사유' : interrupted ? '중단 사유' : '실패 원인',
    reason: mappedReason ?? detail ?? '실행을 완료하지 못한 원인을 확인할 수 없습니다.',
    nextStep: canceled
      ? '필요하면 프로젝트에서 조건을 조정한 뒤 새 실행을 시작할 수 있습니다.'
      : '프로젝트에서 조건을 확인하거나 잠시 후 다시 실행해 주세요.',
    detail: mappedReason && detail !== mappedReason ? detail : null,
    code: error?.code ?? null,
  }
}
