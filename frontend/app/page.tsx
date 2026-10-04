/**
 * Home / Scan page.
 *
 * Big dashed drop-zone card with two CTAs ("Take photo" opens the rear
 * camera on mobile via `capture="environment"`; "Upload from gallery" uses
 * the regular file picker). Drag-and-drop is supported on desktop.
 *
 * After a photo is chosen we show the preview + Retake / Use-this-photo.
 * The "How it works" row uses lucide icons inside soft brand tiles so the
 * page reads as a product, not a wireframe. Demo presets are hidden in a
 * floating menu (see `?demo=1`).
 *
 * The page is forced dynamic because `useSearchParams` and the demo menu
 * make the static-export bailout noisier than the benefit of a cache hit.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Upload,
  RotateCcw,
  ScanLine,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { StepIndicator } from "@/components/step-indicator";
import { DemoMenu } from "@/components/demo-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useScan, getScanApi } from "@/lib/scan-store";
import { useDataMode } from "@/lib/data-mode";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Inline shell rendered while the client component hydrates. */
export default function HomePage() {
  return (
    <ErrorBoundary>
      <Header />
      <main className="container py-6 sm:py-10">
        <React.Suspense fallback={<HomeSkeleton />}>
          <HomeContent />
        </React.Suspense>
      </main>
      <React.Suspense fallback={null}>
        <DemoMenu />
      </React.Suspense>
    </ErrorBoundary>
  );
}

/**
 * Home content lives in its own module so the static export doesn't try to
 * evaluate `useSearchParams` at build time. The Suspense wrapper in
 * `HomePage` above suspends until the dynamic params resolve.
 */
function HomeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useScan();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const mode = useDataMode();
  const isLive = mode.mode === "live";

  const goToScanning = () => {
    router.push(`/scanning${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const onPick = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setPreview(url);
      getScanApi().setPhoto(url);
    };
    reader.readAsDataURL(file);
    (window as unknown as { __pendingFile?: File }).__pendingFile = file;
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    onPick(file);
  };

  return (
    <div className="space-y-8">
      <StepIndicator className="hidden sm:flex" />

      <section className="text-center sm:text-left">
        <h1 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {t(lang, "hero.headline")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-muted sm:text-lg">
          {t(lang, "hero.subline")}
        </p>
        <p className="mt-2 text-sm text-subtle">{t(lang, "hero.tip")}</p>
      </section>

      <section
        aria-label="Capture or upload a label"
        className="mx-auto flex max-w-2xl flex-col gap-3"
      >
        {preview ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-card border bg-surface shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={t(lang, "hero.photoAlt")}
                className="h-auto w-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline" className="sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    getScanApi().setPhoto(null);
                  }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t(lang, "hero.retake")}
                </button>
              </Button>
              <Button size="lg" onClick={goToScanning} className="sm:w-auto">
                <ScanLine className="h-5 w-5" aria-hidden="true" />
                {t(lang, "hero.useThisPhoto")}
              </Button>
            </div>
          </div>
        ) : (
          <Card>
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "m-1 grid cursor-pointer place-items-center rounded-card border-2 border-dashed bg-surface-2 p-6 text-center transition-colors sm:p-10",
                dragging
                  ? "border-brand bg-brand-soft"
                  : "border-hairline hover:border-brand",
              )}
            >
              <div className="mx-auto grid max-w-md gap-3">
                <div
                  aria-hidden="true"
                  className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand"
                >
                  <Camera className="h-6 w-6" />
                </div>
                <p className="text-base font-semibold sm:text-lg">
                  {t(lang, "hero.takePhoto")}
                </p>
                <p className="text-sm text-muted">{t(lang, "hero.dragDrop")}</p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button
                    size="lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraRef.current?.click();
                    }}
                  >
                    <Camera className="h-5 w-5" aria-hidden="true" />
                    {t(lang, "hero.takePhoto")}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                  >
                    <Upload className="h-5 w-5" aria-hidden="true" />
                    {t(lang, "hero.uploadGallery")}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label={t(lang, "hero.takePhoto")}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label={t(lang, "hero.takePhoto")}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t(lang, "hero.uploadGallery")}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </section>

      <section
        aria-labelledby="how-it-works"
        className="mx-auto max-w-3xl space-y-3"
      >
        <h2
          id="how-it-works"
          className="text-center text-lg font-semibold sm:text-xl"
        >
          {t(lang, "how.title")}
        </h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps(lang).map((step, i) => {
            const Icon = stepIcons[i] ?? ScanLine;
            return (
              <li key={step.title}>
                <Card className="h-full">
                  <div className="flex h-full items-start gap-3 p-4">
                    <div
                      aria-hidden="true"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-brand-soft text-brand"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="text-sm text-muted">{step.body}</p>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="text-center text-xs text-subtle" aria-live="polite">
        {mode.mode === "live"
          ? "Live mode: results come from the FastAPI backend."
          : "Demo mode: showing canned labels. Set DATA_MODE=live to use the backend."}
      </p>
    </div>
  );
}

const stepIcons = [ScanLine, ClipboardCheck, ShieldCheck];

function steps(lang: "en" | "hi") {
  return lang === "hi"
    ? [
        { title: "पैकेट का पिछला हिस्सा खींचें", body: "अच्छी रोशनी, सीधी सतह, लाइसेंस साफ़ दिखें।" },
        { title: "जाँचें कि हमने क्या पढ़ा", body: "जाँच से पहले ग़लत लगने वाले नाम या नंबर ठीक करें।" },
        { title: "नतीजा देखें", body: "ट्रस्ट स्कोर, हर जाँच का परिणाम, और सरकारी पोर्टल के लिंक।" },
      ]
    : [
        { title: "Snap the back of the pack", body: "Good light, flat surface, the licence block clearly visible." },
        { title: "Confirm what we read", body: "Fix any names or numbers that look off before we verify." },
        { title: "See the verdict", body: "A Trust Score, the open checks, and links to the official portals." },
      ];
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="mx-auto h-8 w-2/3" />
      <Skeleton className="mx-auto h-4 w-1/2" />
      <Skeleton className="h-44 w-full rounded-card" />
    </div>
  );
}