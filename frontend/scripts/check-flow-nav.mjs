/**
 * Flow-rail navigation: after results, stepping back to type/intake must keep
 * the results step open (run_id is remembered per project).
 */
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const store = new Map()
globalThis.sessionStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => {
    store.set(key, String(value))
  },
  removeItem: (key) => {
    store.delete(key)
  },
}

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
})

try {
  const {
    stageHref,
    routeOwnFlowContext,
    rememberFlowContext,
  } = await server.ssrLoadModule('/src/v2/navigation.ts')

  const resultsRoute = {
    page: 'results',
    projectId: 'proj-1',
    runId: 'run-abc',
  }
  assert.equal(
    stageHref('results', resultsRoute),
    '/results?run_id=run-abc&project_id=proj-1',
  )

  const typeRoute = { page: 'type', projectId: 'proj-1' }
  assert.equal(
    stageHref('results', typeRoute),
    '/results?run_id=run-abc&project_id=proj-1',
    'results step must stay open after back-nav to type',
  )

  const intakeRoute = {
    page: 'intake',
    projectId: 'proj-1',
    simulationType: 'open_survey',
  }
  assert.equal(
    stageHref('results', intakeRoute),
    '/results?run_id=run-abc&project_id=proj-1',
    'results step must stay open after back-nav to intake',
  )
  assert.equal(
    stageHref('intake', intakeRoute),
    '/projects/proj-1/intake?type=open_survey',
  )

  const otherProject = { page: 'type', projectId: 'proj-2' }
  assert.equal(
    stageHref('results', otherProject),
    null,
    'other project must not reuse run_id',
  )

  const loadingNew = {
    page: 'loading',
    projectId: 'proj-1',
    runId: 'run-new',
  }
  assert.equal(
    stageHref('results', loadingNew),
    '/results?run_id=run-new&project_id=proj-1',
  )

  assert.deepEqual(routeOwnFlowContext(typeRoute), {
    projectId: 'proj-1',
    runId: null,
    simulationType: null,
  })

  store.clear()
  rememberFlowContext({ projectId: 'p', runId: 'r1', simulationType: null })
  const merged = rememberFlowContext({
    projectId: 'p',
    runId: null,
    simulationType: 'creative',
  })
  assert.equal(merged.runId, 'r1')
  assert.equal(merged.simulationType, 'creative')

  console.log('Flow nav check passed.')
} finally {
  await server.close()
}
