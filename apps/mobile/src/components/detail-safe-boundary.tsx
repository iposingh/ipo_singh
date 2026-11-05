import { Component, type ErrorInfo, type ReactNode } from "react";
import { View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { EmptyState } from "./empty-state";
import { PrimaryButton } from "./primary-button";

type Props = {
  children: ReactNode;
  onRetry?: () => void;
  onBack?: () => void;
};

type State = {
  failed: boolean;
};

/**
 * Isolates IPO detail render failures so a bad optional section cannot leave a blank trap.
 * Native chart crashes are also guarded deeper by ChartSafeBoundary.
 */
export class DetailSafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Quiet on device builds; the recovery UI is the user-facing signal.
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, padding: mobileTheme.spacing[4], gap: mobileTheme.spacing[3], justifyContent: "center" }}>
        <EmptyState
          title="This IPO page could not be shown"
          description="Something went wrong while drawing this issue. Your catalogue list is still available."
        />
        {this.props.onRetry ? <PrimaryButton label="Try again" onPress={this.props.onRetry} /> : null}
        {this.props.onBack ? <PrimaryButton label="Back to IPOs" onPress={this.props.onBack} /> : null}
      </View>
    );
  }
}
