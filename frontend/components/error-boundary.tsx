/**
 * Top-level React error boundary.
 *
 * Catches render errors anywhere under the `ScanProvider`, shows a friendly
 * message, and offers "Start again" (wipes state and routes home) plus
 * "Try again" (just re-mounts the children).
 */
"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScan } from "@/lib/scan-store";
import { t } from "@/lib/i18n";

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
    return <ErrorScreen error={this.state.error} reset={this.reset} />;
  }
}

function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  const { lang, reset: fullReset } = useScan();
  const startOver = () => {
    fullReset();
    reset();
    if (typeof window !== "undefined") window.location.assign("/");
  };
  return (
    <main className="container py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 text-warn"
              aria-hidden="true"
            />
            {t(lang, "common.error")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            {error.message || t(lang, "common.error")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>{t(lang, "common.tryAgain")}</Button>
            <Button variant="outline" onClick={startOver}>
              {t(lang, "common.startAgain")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}