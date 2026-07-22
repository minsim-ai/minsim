/**
 * Regression: campus_priority JSON responses must not appear as research quotes.
 */
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
})

try {
  const module = await server.ssrLoadModule('/src/v2/minsimReport.ts')
  const humanQuoteFromRaw = module.humanQuoteFromRaw
  const choiceOf = module.choiceOf

  const item = {
    uuid: 'p1',
    persona: { sex: '남자', age: 21, province: '대구', occupation: '학부생' },
    response: JSON.stringify({
      ranking: ['학식 질 개선', '도서관 신설', '학교 내 편의점 추가', 'ai 구독료 지원'],
      top_reason: '기숙사 생활이라 매일 식사가 곧 하루 컨디션이랑 직결돼요.',
      bottom_reason: '당장 필요를 못 느껴요.',
    }),
    parsed: {
      ranking: ['학식 질 개선', '도서관 신설', '학교 내 편의점 추가', 'ai 구독료 지원'],
      top_reason: '기숙사 생활이라 매일 식사가 곧 하루 컨디션이랑 직결돼요.',
      bottom_reason: '당장 필요를 못 느껴요.',
    },
    error: null,
  }

  const quote = humanQuoteFromRaw(item)
  if (!quote.includes('기숙사 생활')) {
    throw new Error(`expected top_reason prose, got: ${quote}`)
  }
  if (quote.includes('{') || quote.includes('ranking')) {
    throw new Error(`quote still looks like JSON: ${quote}`)
  }
  if (choiceOf(item) !== '학식 질 개선') {
    throw new Error(`expected ranking top as choice, got: ${choiceOf(item)}`)
  }

  const rawOnly = humanQuoteFromRaw({
    ...item,
    parsed: null,
  })
  if (!rawOnly.includes('기숙사 생활') || rawOnly.includes('"ranking"')) {
    throw new Error(`raw JSON fallback failed: ${rawOnly}`)
  }

  console.log('campus priority quote check passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
