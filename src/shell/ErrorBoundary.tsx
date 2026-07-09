import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="pt-12 text-center text-sm" style={{ color: "var(--muted)" }}>
          <p className="mb-3 font-medium" style={{ color: "var(--ink)" }}>
            Er ging iets mis.
          </p>
          <p className="mb-4">Deze pagina kon niet worden geladen.</p>
          <button
            className="btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.href = "/";
            }}
          >
            Terug naar dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
