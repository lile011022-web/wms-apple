import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

type ErrorBoundaryState = {
  error?: Error;
};

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('WMS web render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="app-error-fallback">
          <h1>页面加载失败</h1>
          <p>请刷新页面后重试。若手机仍然白屏，请把下面这行错误发给管理员。</p>
          <pre>{this.state.error.message || 'Unknown frontend error'}</pre>
        </main>
      );
    }

    return this.props.children;
  }
}
