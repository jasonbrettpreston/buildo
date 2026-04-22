import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // TODO Phase 8: Sentry.captureException(error, { extra: info })
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <SafeAreaView className="flex-1 bg-bg-feed items-center justify-center px-6">
          <Text className="text-red-alert font-mono text-sm tracking-widest uppercase mb-3">
            Something went wrong
          </Text>
          {this.state.errorMessage && (
            <Text className="text-text-muted text-xs text-center font-mono mb-8 leading-relaxed">
              {this.state.errorMessage}
            </Text>
          )}
          <Pressable
            onPress={this.handleReset}
            className="bg-zinc-800 border border-zinc-700 rounded-sm px-6 py-3 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text className="text-text-primary font-mono text-sm tracking-wide">
              TRY AGAIN
            </Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
