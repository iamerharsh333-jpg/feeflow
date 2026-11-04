import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, LogOut } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FeeFlow ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleResetSession = () => {
    localStorage.removeItem('feeflow_auth');
    localStorage.removeItem('feeflow_token');
    window.location.href = '/login';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h1 className="text-lg font-bold text-slate-900 mb-1">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h1>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-md mx-auto">
              An unexpected client error occurred while rendering this view. You can reload the page, return to your dashboard, or reset your session.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-6">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Page
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full sm:w-auto px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                Dashboard
              </button>

              <button
                onClick={this.handleResetSession}
                className="w-full sm:w-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>

            {this.state.error && (
              <details className="text-left bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 overflow-hidden">
                <summary className="font-semibold text-slate-700 cursor-pointer select-none">
                  Technical Error Details
                </summary>
                <div className="mt-2 font-mono text-[11px] text-red-700 overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.toString()}
                </div>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 font-mono text-[10px] text-slate-500 overflow-x-auto max-h-32">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

