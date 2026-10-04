/**
 * Scanning: the photo with a sweep over it while `POST /api/scan` is in flight.
 *
 * Three outcomes, and none of them is a dead end:
 *
 * - fields came back      -> straight to Review
 * - nothing could be read -> say so plainly and offer manual entry. The OCR
 *   pipeline is not connected yet, so today this is the *normal* path, not an
 *   error, and it must not look like one.
 * - the request failed    -> an error with a retry
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Camera, RefreshCw, PencilLine, AlertTriangle } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useScan } from "@/lib/scan-store";
import { SCAN_TIMEOUT_MS, scanLabel } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

type Stage = "working" | "unreadable" | "error";

/** Rotated under the progress bar so a long wait still looks like progress. */
const MESSAGES = [
  "scanning.compressing",
  "scanning.reading",
  "scanning.records",
  "scanning.almost",
] as const;

export default function ScanningPage() {
  return (
    <PageShell>
      <React.Suspense fallback={null}>
        <ScanningContent />
      </React.Suspense>
    </PageShell>
  );
}

function ScanningContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang, photo, photoUrl, setDraftFromScan, startEmptyDraft } = useScan();

  const mock = params.get("mock");
  const query = mock ? `?mock=${mock}` : "";

  const [stage, setStage] = React.useState<Stage>("working");
  const [progress, setProgress] = React.useState(6);
  const [messageIndex, setMessageIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const started = React.useRef(false);

  const toReview = React.useCallback(() => {
    router.push(`/review${query}`);
  }, [router, query]);

  const run = React.useCallback(async () => {
    setStage("working");
    setError(null);
    setProgress(6);
    setMessageIndex(0);

    // Without a photo there is nothing to send - unless a demo preset is
    // driving the screen, which supplies its own fixture.
    if (!photo && !mock) {
      startEmptyDraft();
      setStage("unreadable");
      return;
    }

    const file =
      photo ?? new File([new Uint8Array(1)], "demo.jpg", { type: "image/jpeg" });

    try {
      const response = await scanLabel(file, mock);
      setProgress(100);
      setDraftFromScan(response);

      // An empty field map is the honest "we read nothing" case.
      if (Object.keys(response.fields).length === 0) {
        setStage("unreadable");
        return;
      }
      toReview();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted ? t(lang, "scanning.timeout") : t(lang, "scanning.networkError"),
      );
      setStage("error");
    }
  }, [photo, mock, lang, setDraftFromScan, startEmptyDraft, toReview]);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  // Creep towards 90% while waiting. It never reaches 100 on its own: the bar
  // completes when the response does, not on a timer pretending to know.
  React.useEffect(() => {
    if (stage !== "working") return;
    const step = SCAN_TIMEOUT_MS / 100;
    const tick = setInterval(() => setProgress((p) => Math.min(90, p + 2)), step);
    const rotate = setInterval(
      () => setMessageIndex((i) => (i + 1) % MESSAGES.length),
      2200,
    );
    return () => {
      clearInterval(tick);
      clearInterval(rotate);
    };
  }, [stage]);

  if (stage === "error") {
    return (
      <Centered>
        <Card>
          <CardContent className="space-y-5 p-6 text-center sm:p-8">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive-soft text-destructive">
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="text-lg font-bold">{t(lang, "common.somethingWrong")}</p>
            <p className="text-base text-muted-foreground">{error}</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={run}>
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
                {t(lang, "scanning.retry")}
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/${query}`)}>
                <Camera className="h-5 w-5" aria-hidden="true" />
                {t(lang, "app.retake")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (stage === "unreadable") {
    return (
      <Centered>
        <Card>
          <CardContent className="space-y-5 p-6 text-center sm:p-8">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <PencilLine className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {t(lang, "scanning.unreadableTitle")}
            </h1>
            <p className="text-base text-muted-foreground">
              {t(lang, "scanning.unreadableBody")}
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={toReview}>
                {t(lang, "scanning.enterManually")}
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/${query}`)}>
                <Camera className="h-5 w-5" aria-hidden="true" />
                {t(lang, "app.retake")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="sr-only">{t(lang, "scanning.title")}</h1>
      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <ScanPreview url={photoUrl} lang={lang} />
          <Progress value={progress} label={t(lang, "scanning.title")} />
          <p
            aria-live="polite"
            className="text-center text-base font-semibold text-foreground"
          >
            {t(lang, MESSAGES[messageIndex])}
          </p>
        </CardContent>
      </Card>
    </Centered>
  );
}

function ScanPreview({ url, lang }: { url: string | null; lang: Lang }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-muted">
      {url ? (
        <Image src={url} alt="" fill unoptimized className="object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">
          {t(lang, "scanning.title")}
        </div>
      )}
      {/* The sweep: a teal bar travelling top to bottom, purely decorative. */}
      <div
        aria-hidden="true"
        className="scan-sweep absolute inset-x-0 top-0 h-1 bg-primary shadow-[0_0_24px_6px_hsl(var(--primary)/0.45)]"
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl space-y-5">{children}</div>;
}
