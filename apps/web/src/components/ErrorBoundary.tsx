import { Component, type ReactNode } from "react";

type Props = {
  fallback?: (error: Error, retry: () => void) => ReactNode;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * ErrorBoundary por widget. Cada card del dashboard tiene el suyo:
 * un gráfico caído no tumba el dashboard entero. (Sección 5 del
 * doc de diseño: aislamiento por widget.)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <p className="text-sm text-red-600 mb-2">
            Error al cargar este widget
          </p>
          <p className="text-xs text-gray-400 mb-3">
            {this.state.error.message}
          </p>
          <button
            onClick={this.handleRetry}
            className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
