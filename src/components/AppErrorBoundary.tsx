import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  hasError: boolean;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center justify-center">
          <div className="w-full space-y-4 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">Application error</p>
              <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
              <p className="break-words text-sm text-muted-foreground">
                {this.state.error?.message || "The app hit an unexpected error."}
              </p>
            </div>

            <Button onClick={this.handleReload}>Reload App</Button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;