import { Component, type ErrorInfo, type ReactNode } from "react";
import { EmptyState } from "./empty-state";

type Props = {
  children: ReactNode;
  title?: string;
  description?: string;
};

type State = {
  failed: boolean;
};

/**
 * Isolates gifted-charts / SVG failures so one bad series cannot crash IPO detail.
 * Does not hide API or catalogue failures elsewhere on the screen.
 */
export class ChartSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally quiet: mobile builds avoid console noise; EmptyState is the user signal.
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <EmptyState
          title={this.props.title ?? "Chart unavailable"}
          description={
            this.props.description ??
            "This chart could not be drawn on this device. The readings table below still lists stored values when available."
          }
        />
      );
    }
    return this.props.children;
  }
}
