/**
 * Top-level React error boundary. Catches render errors anywhere under the
 * `ScanProvider`, shows a friendly message and a way back to the home page.
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console -- visible in dev console
    console.error("VerifyIT error boundary caught", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="container py-12">
        <Card>
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {this.state.error.message ||
                "VerifyIT ran into an unexpected problem."}
            </p>
            <div className="flex gap-2">
              <Button onClick={this.reset}>Try again</Button>
              <Button variant="outline" onClick={() => (window.location.href = "/")}>
                Go home
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }
}