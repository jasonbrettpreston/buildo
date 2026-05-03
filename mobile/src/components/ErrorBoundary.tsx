import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dumpDiagnostics } from '@/lib/debug/stateDebug';

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

  componentDidCatch(error: unknown, _info: React.ErrorInfo): void {
    // Sanitize: log only the error message, never the full error object or
    // componentStack — both can carry user PII (addresses, permit numbers,
    // response bodies) into logs / Sentry. When Phase 8 wires Sentry, pass
    // only the sanitized message + a 'feature' tag; do NOT pass extra: info.
    const safeMessage = error instanceof Error ? error.message : String(error);
    console.error('[ErrorBoundary]', safeMessage);
    // Spec 99 §7.1 + §9.5: dump render/effect counts at the moment of crash.
    // dumpDiagnostics returns '' in production (__DEV__ guard in stateDebug.ts).
    // Guard against logging an empty string in production crashes — would
    // emit a useless blank line to Sentry/Crashlytics on every boundary catch
    // (Gemini WF3-§9.5 review #2 + DeepSeek F6 consensus; Metro DCE strips
    // function bodies but cannot prove dumpDiagnostics()'s return value here).
    const diag = dumpDiagnostics();
    if (diag) console.error(diag);
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
