import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label so logs identify which boundary tripped. */
  name?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render-time exceptions so a single bad value cannot unmount the whole
 * application (DEF-005). Before this existed, an unexpected `/api/permissions`
 * response threw inside canSeeMenu and the admin console rendered a blank page
 * with no indication of what went wrong.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The page failed to load. This has been logged. Try reloading — if it keeps happening, contact support.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-500">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
