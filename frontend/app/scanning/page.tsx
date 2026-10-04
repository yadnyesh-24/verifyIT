/**
 * Scanning page. Shows a progress state while the API call is in flight, an
 * error state with a retry button if the call fails, and routes to `/review`
 * on success.
 *
 * The page also accepts a `?mock=genuine|multi|fake` query so the demo can run
 * without a real image or backend.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Camera, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useScan } from "@/lib/scan-store";
import { scanLabel } from "@/lib/api";
import { mockKeys } from "@/lib/mocks";
import { t } from "@/lib/i18n";

export default function ScanningPage() {
  return (
    <ErrorBoundary>
      <Header />
      <main className="container py-6 sm:py-10">
        <React.Suspense fallback={<ScanningSkeleton />}>
          <ScanningContent />
        </React.Suspense>
      </main>
    </ErrorBoundary>
  );
}

function ScanningContent() {
  const router = useRouter();
  const params = useSearchParams();
  const mockParam = params.get("mock");
  const isDemo = mockKeys.includes(mockParam as never);
  const { lang, setScan } = useScan();
  const [progress, setProgress] = React.useState(8);
  const [stage, setStage] = React.useState<"compressing" | "reading" | "records">(
    "compressing",
  );
  const [error, setError] = React.useState<string | null>(null);
  const startedRef = React.useRef(false);

  const run = React.useCallback(async () => {
    setProgress(8);
    setStage("compressing");
    setError(null);

    const pending = (window as unknown as { __pendingFile?: File }).__pendingFile;
    if (!pending && !isDemo) {
      setError(t(lang, "scanning.unreadableError"));
      return;
    }

    try {
      // Smoothly tick the UI to keep it honest.
      const tick = setInterval(() => {
        setProgress((p) => Math.min(85, p + 4));
      }, 250);
      const stageTimer = setTimeout(() => setStage("reading"), 700);
      const recordsTimer = setTimeout(() => setStage("records"), 1500);

      // Mock when there is no real image or when the demo param is set.
      const file =
        pending ?? new File([new Uint8Array(8)], "demo.jpg", { type: "image/jpeg" });
      const resp = await scanLabel(file, mockParam);
      clearInterval(tick);
      clearTimeout(stageTimer);
      clearTimeout(recordsTimer);
      setProgress(100);
      setScan(resp);
      router.push(`/review${mockParam ? `?mock=${mockParam}` : ""}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : t(lang, "scanning.networkError");
      setError(message);
      toast.error(t(lang, "scanning.networkError"));
    }
  }, [isDemo, lang, mockParam, router, setScan]);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
  }, [run]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="sr-only">{t(lang, "scanning.readingLabel")}</h1>

      <Card>
        <CardContent className="space-y-4 p-6">
          {error ? (
            <div className="space-y-3 text-center">
              <div
                aria-hidden="true"
                className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive"
              >
                !
              </div>
              <p className="font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                {t(lang, "scanning.networkError")}
              </p>
              <div className="flex justify-center gap-2">
                <Button onClick={run}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t(lang, "scanning.retry")}
                </Button>
                <Button asChild variant="outline">
                  <Link href="/">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    {t(lang, "app.retake")}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-base font-medium">
                {stage === "compressing"
                  ? t(lang, "scanning.compressing")
                  : stage === "reading"
                    ? t(lang, "scanning.readingLabel")
                    : t(lang, "scanning.checkingRecords")}
              </p>
              <Progress value={progress} label="Scanning progress" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanningSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Skeleton className="mx-auto h-6 w-40" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}