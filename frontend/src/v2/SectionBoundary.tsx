import { Component, type ReactNode } from 'react'

/**
 * Per-section error boundary: one broken report section must never blank the
 * whole results page (D-1 invariant I5).
 */
export class SectionBoundary extends Component<
  { title: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="card" role="alert" style={{ padding: 20, margin: '16px 0' }}>
          <strong style={{ fontSize: 14 }}>‘{this.props.title}’ 섹션을 표시하지 못했습니다</strong>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6, marginBottom: 0 }}>
            다른 섹션과 원자료에는 영향이 없습니다. 내보내기에서 전체 데이터를 확인할 수 있습니다.
          </p>
        </section>
      )
    }
    return this.props.children
  }
}
