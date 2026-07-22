import type { MinsimReport, TitleBody } from './minsimReport'
import { formatShare } from './minsimReport'

export type MinsimPdfMeta = {
  projectName: string
  runLabel: string
}

/**
 * Opens a print-ready full report. Users save via the browser print dialog
 * ("Save as PDF" / "PDF로 저장"). Avoids shipping a heavy PDF stack while
 * keeping Korean typography and multi-page layout reliable.
 */
export function openMinsimReportPdf(report: MinsimReport, meta: MinsimPdfMeta): void {
  const title = sanitizeFilename(`${meta.projectName || 'minsim'}-${meta.runLabel || 'report'}`)
  const html = buildReportHtml(report, meta, title)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    throw new Error('PDF 미리보기를 열 수 없습니다. 팝업 차단을 확인해 주세요.')
  }

  doc.open()
  doc.write(html)
  doc.close()
  doc.title = title

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 500)
  }

  win.addEventListener('afterprint', cleanup, { once: true })
  // Fallback if afterprint is skipped (some WebKit builds).
  window.setTimeout(cleanup, 60_000)

  const trigger = () => {
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
      throw new Error('인쇄 대화상자를 열지 못했습니다. 브라우저 설정을 확인해 주세요.')
    }
  }

  // Wait a tick so fonts/layout settle before the print dialog.
  if (doc.fonts?.ready) {
    void doc.fonts.ready.then(trigger).catch(trigger)
  } else {
    window.setTimeout(trigger, 120)
  }
}

function buildReportHtml(report: MinsimReport, meta: MinsimPdfMeta, title: string): string {
  const { run, winner, runnerUp, core, decision, report: ai, objections, regions, finalSummary } = report
  const sampleLine = `응답 ${run.valid}명 · ${run.ts || '일시 없음'}`
  const winnerShare = winner ? formatShare(winner.pct, winner.count, run.valid) : '집계 중'
  const regionRows = regions
    .slice(0, 12)
    .map(
      (region) => `
      <tr>
        <td>${escapeHtml(region.name)}</td>
        <td>${escapeHtml(region.lead)}</td>
        <td>${escapeHtml(String(region.focusPct))}%</td>
        <td>${region.n}명</td>
        <td>${escapeHtml(region.reliability)}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111;
      font-family: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      font-size: 12.5px;
      line-height: 1.55;
      background: #fff;
    }
    h1 { font-size: 22px; line-height: 1.25; margin: 0 0 8px; letter-spacing: -0.02em; }
    h2 { font-size: 14px; margin: 0 0 10px; letter-spacing: -0.01em; }
    h3 { font-size: 12px; margin: 0 0 6px; color: #444; font-weight: 600; }
    p { margin: 0 0 8px; }
    .muted { color: #666; }
    .kicker { font-size: 11px; letter-spacing: 0.04em; color: #666; text-transform: uppercase; margin-bottom: 4px; }
    .header { border-bottom: 1px solid #e5e5e5; padding-bottom: 14px; margin-bottom: 18px; }
    .section { break-inside: avoid; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #f0f0f0; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
    .metric { border: 1px solid #e8e8e8; border-radius: 10px; padding: 10px 12px; }
    .metric .v { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .metric .s { color: #666; font-size: 11px; margin-top: 4px; }
    ol, ul { margin: 0; padding-left: 18px; }
    li { margin: 0 0 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th, td { border-bottom: 1px solid #eee; text-align: left; padding: 6px 4px; vertical-align: top; }
    th { color: #666; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; font-size: 11px; }
    .footer { margin-top: 20px; color: #777; font-size: 11px; line-height: 1.5; }
    .hint { display: none; }
    @media screen {
      body { padding: 28px; max-width: 820px; margin: 0 auto; }
      .hint {
        display: block;
        margin-bottom: 16px;
        padding: 10px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        color: #334155;
        font-size: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="hint">인쇄 대화상자에서 대상/프린터를 <strong>PDF로 저장</strong>으로 선택하면 전체 보고서가 파일로 저장됩니다.</div>
  <header class="header">
    <div class="kicker">minsim 결과 보고서</div>
    <h1>${escapeHtml(meta.runLabel || '시뮬레이션 결과')}</h1>
    <p class="muted">${escapeHtml(meta.projectName || '프로젝트')} · ${escapeHtml(sampleLine)} · ${escapeHtml(run.status)}</p>
  </header>

  <section class="section">
    <h2>최종 판단</h2>
    ${winner ? `<p><span class="badge">1위 · ${escapeHtml(winner.label)}</span> <strong>${winner.pct}%</strong> · ${escapeHtml(winnerShare)}</p>
    <p>${escapeHtml(winner.text)}</p>` : '<p class="muted">대표 반응 집계 중</p>'}
    <p>${escapeHtml(run.verdictLine)} ${escapeHtml(run.conclusion)}</p>
    <div class="metrics">
      <div class="metric"><div class="kicker">응답 표본</div><div class="v">${run.panel}명</div><div class="s">유효 ${run.valid}명</div></div>
      <div class="metric"><div class="kicker">${escapeHtml(report.segment.metricLabel)}</div><div class="v">${winner ? `${winner.pct}%` : '—'}</div><div class="s">${winner ? escapeHtml(winner.label) : '집계 중'}</div></div>
      <div class="metric"><div class="kicker">해석 상태</div><div class="v" style="font-size:15px">${escapeHtml(run.status)}</div><div class="s">구조화 성공 ${escapeHtml(run.structured)}</div></div>
    </div>
    ${runnerUp ? `<p class="muted">비교 기준 · ${escapeHtml(runnerUp.label)} ${runnerUp.pct}% · 격차 ${escapeHtml(run.gap)}</p>` : ''}
  </section>

  <section class="section">
    <h2>한 줄 결론</h2>
    <p>${escapeHtml(core.conclusion)}</p>
    ${renderTitleBodyList('긍정 이유', core.positives)}
    ${renderTitleBodyList('거절 이유', core.rejections)}
    ${renderTitleBodyList('개선 제안', core.improvements)}
  </section>

  <section class="section">
    <h2>판세 · 신뢰도</h2>
    ${decision.judgeBody.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
  </section>

  <section class="section">
    <h2>AI 해석 보고서</h2>
    <h3>${escapeHtml(ai.headline || '핵심 결론')}</h3>
    <p>${escapeHtml(ai.summary)}</p>
    ${renderTitleBodyList('핵심 발견', ai.findings)}
    ${renderTitleBodyList('추천 행동', ai.actions)}
    ${renderTitleBodyList('주의할 점', ai.watch)}
  </section>

  ${objections.length ? `
  <section class="section">
    <h2>주요 거부 요인</h2>
    <ol>
      ${objections.map((item) => `<li><strong>${escapeHtml(item.reason)}</strong> · ${item.pct}%</li>`).join('')}
    </ol>
  </section>` : ''}

  ${regionRows ? `
  <section class="section">
    <h2>지역 반응 순위</h2>
    <table>
      <thead><tr><th>지역</th><th>대표 반응</th><th>반응률</th><th>표본</th><th>신뢰</th></tr></thead>
      <tbody>${regionRows}</tbody>
    </table>
  </section>` : ''}

  ${finalSummary ? `
  <section class="section">
    <h2>한 장 요약</h2>
    ${finalSummary.winner ? `<p><strong>${escapeHtml(finalSummary.winner.label)}</strong> ${finalSummary.winner.pct}% (${finalSummary.winner.count}명)</p>` : ''}
    <p>${escapeHtml(finalSummary.verdictLine)}</p>
    ${renderTitleBodyList('핵심 페인포인트', finalSummary.pains)}
    ${renderTitleBodyList('추천 액션', finalSummary.actions)}
    <p><strong>주의할 점</strong> · ${escapeHtml(finalSummary.caution)}</p>
  </section>` : ''}

  <footer class="footer">
    <p>minsim · 응답 ${run.valid}명${run.ts ? ` · ${escapeHtml(run.ts)}` : ''}</p>
  </footer>
</body>
</html>`
}

function renderTitleBodyList(heading: string, items: TitleBody[]): string {
  if (!items.length) return ''
  return `<h3>${escapeHtml(heading)}</h3>
  <ol>
    ${items
      .map((item) => {
        const body = item.body?.trim() ? ` — ${escapeHtml(item.body)}` : ''
        return `<li><strong>${escapeHtml(item.title)}</strong>${body}</li>`
      })
      .join('')}
  </ol>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return cleaned || 'minsim-report'
}
