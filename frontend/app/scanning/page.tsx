/**
 * Scanning page.
 *
 * Shows the photo dimmed with an animated scan line, rotating messages
 * ("Reading the label...", "Finding licence numbers...", "Checking public
 * records..."). Times out at 30s with a retry button.
 *
 * On `status: "not_checked"` (OCR unavailable) or any other failure we soft-
 * route to the Review screen with empty fields so the user can fill them in
 * themselves - the spec says no red error here, only a soft "couldn't read"
 * message.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, RefreshCw, RotateCcw, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Progress } from "@/components/ui/progress";
import { StepIndicator } from "@/components/step-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { useScan } from "@/lib/scan-store";
import { useDataMode } from "@/lib/data-mode";
import { scan as apiScan } from "@/lib/api";
import { t } from "@/lib/i18n";
import { mockKeys, type MockKey } from "@/lib/mocks";
import { cn } from "@/lib/utils";

// All four routes read `useSearchParams` for the demo query; force dynamic so
// the build doesn't try to prerender them and warn about the missing
// Suspense boundary.
export const dynamic = "force-dynamic";

const SCAN_TIMEOUT_MS = 30_000;
const STAGES = [
  "scanning.readingLabel",
  "scanning.findingLicences",
  "scanning.checkingRecords",
] as const;

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
  const { lang, setScan, photoDataUrl } = useScan();
  const mode = useDataMode();

  const [progress, setProgress] = React.useState(8);
  const [stage, setStage] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const [softFail, setSoftFail] = React.useState(false);
  const startedRef = React.useRef(false);

  const run = React.useCallback(async () => {
    setProgress(8);
    setStage(0);
    setTimedOut(false);
    setSoftFail(false);

    const pending = (window as unknown as { __pendingFile?: File }).__pendingFile;
    if (!pending && !isDemo) {
      setSoftFail(true);
      return;
    }

    const tick = setInterval(() => setProgress((p) => Math.min(88, p + 3)), 220);
    const stageTimer = setInterval(
      () => setStage((s) => (s + 1) % STAGES.length),
      1800,
    );
    const timeoutTimer = setTimeout(() => setTimedOut(true), SCAN_TIMEOUT_MS);

    try {
      const file =
        pending ??
        new File([new Uint8Array(8)], "demo.jpg", { type: "image/jpeg" });
      const resp = await apiScan(file, mode.mode, mockParam as MockKey | null);
      clearInterval(tick);
      clearInterval(stageTimer);
      clearTimeout(timeoutTimer);
      setProgress(100);

      if (
        resp.status === "not_checked" &&
        (resp.reason ?? "").toLowerCase().includes("ocr")
      ) {
        setSoftFail(true);
        return;
      }

      setScan(resp);
      router.push(`/review${mockParam ? `?mock=${mockParam}` : ""}`);
    } catch (err) {
      clearInterval(tick);
      clearInterval(stageTimer);
      clearTimeout(timeoutTimer);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : t(lang, "scanning.retry");
      toast.error(message);
      setSoftFail(true);
    }
  }, [isDemo, lang, mockParam, mode.mode, router, setScan]);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
  }, [run]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <StepIndicator />

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="relative overflow-hidden rounded-card border bg-surface-2">
            {photoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoDataUrl}
                alt={t(lang, "hero.photoAlt")}
                className={cn(
                  "h-56 w-full object-contain opacity-70 sm:h-72",
                  timedOut || softFail ? "opacity-40" : "",
                )}
              />
            ) : (
              <div className="grid h-56 w-full place-items-center text-sm text-muted sm:h-72">
                <Camera className="mr-2 inline h-5 w-5" aria-hidden="true" />
                {t(lang, "hero.photoAlt")}
              </div>
            )}

            {!timedOut && !softFail ? (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-1/3 scan-line animate-scan-line"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 border-2 border-brand/40"
                />
              </>
            ) : null}
          </div>

          <Progress value={progress} label="Scanning" />

          {timedOut ? (
            <TimeoutView lang={lang} onRetry={() => run()} />
          ) : softFail ? (
            <SoftFailView
              lang={lang}
              onFill={() => {
                setScan({
                  scan_id: null,
                  status: "ok",
                  reason: null,
                  fields: { product: {}, parties: [], unassigned_licences: [] },
                });
                router.push(`/review${mockParam ? `?mock=${mockParam}` : ""}`);
              }}
            />
          ) : (
            <div className="space-y-1 text-center">
              <p className="text-base font-medium">
                {t(lang, STAGES[stage])}
              </p>
              <p className="text-xs text-muted">
                {mode.mode === "mock" || isDemo
                  ? "Demo reader - no real OCR"
                  : "Sending the photo to VerifyIT..."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button asChild variant="ghost">
          <Link href="/">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t(lang, "common.back")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function TimeoutView({ lang, onRetry }: { lang: "en" | "hi"; onRetry: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-base font-medium">{t(lang, "scanning.timeoutTitle")}</p>
      <p className="text-sm text-muted">{t(lang, "scanning.timeoutBody")}</p>
      <Button onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t(lang, "scanning.retry")}
      </Button>
    </div>
  );
}

function SoftFailView({
  lang,
  onFill,
}: {
  lang: "en" | "hi";
  onFill: () => void;
}) {
  return (
    <div className="space-y-3 text-center">
      <div
        aria-hidden="true"
        className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-warn/10 text-warn"
      >
        <FileWarning className="h-5 w-5" />
      </div>
      <p className="text-base font-medium">{t(lang, "scanning.unreadableTitle")}</p>
      <p className="text-sm text-muted">{t(lang, "scanning.unreadableBody")}</p>
      <Button onClick={onFill} variant="outline">
        {t(lang, "scanning.fillYourself")}
      </Button>
    </div>
  );
}

function ScanningSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Skeleton className="mx-auto h-8 w-2/3" />
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-2 w-full" />
    </div>
  );
}