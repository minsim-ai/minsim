import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
})

try {
  const module = await server.ssrLoadModule('/src/v2/runTerminalCopy.ts')
  const timeout = module.terminalRunCopy('failed', {
    code: 'LLM_TIMEOUT',
    message: 'LLM request timed out after retry.',
  })
  const interrupted = module.terminalRunCopy('interrupted', {
    code: 'WORKER_INTERRUPTED',
    message: 'Worker stopped before final envelope persistence.',
  })

  const failures = []
  if (timeout.reason !== 'AI 응답 생성 시간이 제한을 넘었습니다.') failures.push('timeout reason is not user-facing')
  if (timeout.detail !== 'LLM request timed out after retry.') failures.push('timeout technical detail is missing')
  if (timeout.code !== 'LLM_TIMEOUT') failures.push('timeout error code is missing')
  if (interrupted.title !== '실행이 중단되었습니다') failures.push('interrupted status title is incorrect')

  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else {
    console.log('Loading failure state check passed.')
  }
} finally {
  await server.close()
}
