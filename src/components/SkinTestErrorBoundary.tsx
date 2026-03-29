import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * SkinTest 렌더 중 예외 시 전체 앱 대신 이 구간만 복구 UI 표시 (흰 화면 방지).
 */
export class SkinTestErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, message: e?.message ?? String(e) };
  }

  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('[SkinTestErrorBoundary]', e, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto min-h-[50dvh] max-w-lg px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-slate-900">피부 테스트 화면을 불러오지 못했습니다</h1>
          <p className="mt-2 text-sm text-slate-600">
            잠시 후 새로고침하거나 처음부터 다시 열어 주세요.
          </p>
          {this.state.message ? (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-700">
              {this.state.message}
            </pre>
          ) : null}
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
            <Link to="/" className="text-sm text-brand hover:underline">
              홈으로
            </Link>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
