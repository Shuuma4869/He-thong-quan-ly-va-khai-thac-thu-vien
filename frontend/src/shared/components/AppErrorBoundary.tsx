import { Component, type ErrorInfo, type PropsWithChildren } from 'react';

type State = { hasError: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Giai đoạn sau sẽ chuyển lỗi đã giảm dữ liệu nhạy cảm sang hệ thống quan sát.
    console.error('Lỗi giao diện chưa được xử lý', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
          <div>
            <p className="eyebrow">Có lỗi xảy ra</p>
            <h1 className="page-title mt-2">Không thể hiển thị trang này</h1>
            <p className="mt-3 text-muted">Vui lòng tải lại trang. Nếu lỗi tiếp tục, hãy liên hệ nhân viên thư viện.</p>
            <button className="button-primary mt-7" onClick={() => window.location.reload()}>Tải lại trang</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
