/**
 * Home page. Big "Scan label" CTA, upload photo, image preview with retake,
 * "How it works" steps, language toggle in the header.
 *
 * Picking a file - from camera or library - goes straight to `/scanning` with
 * the chosen file in a transient ref (URL.createObjectURL). The page also
 * honours `?mock=genuine|multi|fake` for the demo (see `lib/mocks.ts`).
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Camera, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useScan } from "@/lib/scan-store";
import { mockKeys, isMockMode } from "@/lib/mocks";
import { t } from "@/lib/i18n";

export default function HomePage() {
  return (
    <ErrorBoundary>
      <Header />
      <main className="container py-6 sm:py-10">
        <React.Suspense fallback={<HomeSkeleton />}>
          <HomeContent />
        </React.Suspense>
      </main>
    </ErrorBoundary>
  );
}

function HomeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useScan();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  const mockParam = params.get("mock");
  const isDemoMock = mockKeys.includes(mockParam as never);
  const mockActive = isMockMode() || isDemoMock;

  const goToScanning = React.useCallback(() => {
    router.push(`/scanning${mockActive && mockParam ? `?mock=${mockParam}` : ""}`);
  }, [router, mockActive, mockParam]);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      sessionStorage.setItem(
        "verifyit:pendingImage",
        JSON.stringify({ name: file.name, size: file.size, type: file.type }),
      );
      // Stash the actual file on window: ferrying a binary blob between client
      // routes without serialising it.
      (window as unknown as { __pendingFile?: File }).__pendingFile = file;
    } catch {
      /* sessionStorage unavailable */
    }
    setPreview(url);
  };

  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t(lang, "app.productName")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
          {t(lang, "app.tagline")}
        </p>
      </section>

      <section
        aria-label="Capture or upload a label"
        className="mx-auto flex max-w-xl flex-col items-center gap-4"
      >
        {preview ? (
          <div className="w-full overflow-hidden rounded-xl border bg-card">
            <Image
              src={preview}
              alt="Captured label"
              width={800}
              height={600}
              unoptimized
              className="h-auto w-full object-contain"
            />
          </div>
        ) : null}

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            onClick={() => cameraRef.current?.click()}
            className="w-full sm:w-auto"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            {t(lang, "app.scanLabel")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="w-full sm:w-auto"
          >
            <Upload className="h-5 w-5" aria-hidden="true" />
            {t(lang, "app.uploadPhoto")}
          </Button>
        </div>

        {preview ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              variant="success"
              onClick={goToScanning}
              className="w-full sm:w-auto"
            >
              {t(lang, "review.verify")}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                URL.revokeObjectURL(preview);
              }}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t(lang, "app.retake")}
            </Button>
          </div>
        ) : null}

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label={t(lang, "app.scanLabel")}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t(lang, "app.uploadPhoto")}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </section>

      <section aria-label="Demo presets" className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
            {mockKeys.map((key) => (
              <Link
                key={key}
                href={`/?mock=${key}`}
                className="rounded-md border bg-background p-3 text-sm transition-colors hover:bg-muted"
              >
                <span className="block font-medium capitalize">{key}</span>
                <span className="block text-xs text-muted-foreground">
                  {key === "genuine" && "Single party, all green"}
                  {key === "multi" && "Marketer + 2 units, state mismatch"}
                  {key === "fake" && "Company not found, FSSAI wrong"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {mockActive
            ? "Demo mode: data is loaded from the bundled mock fixtures."
            : "Live mode: requests go to the FastAPI backend."}
        </p>
      </section>

      <section
        aria-labelledby="how-it-works"
        className="mx-auto max-w-3xl space-y-3"
      >
        <h2
          id="how-it-works"
          className="text-center text-lg font-semibold sm:text-xl"
        >
          {t(lang, "app.howItWorksTitle")}
        </h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {getHowItWorks(lang).map((step, idx) => (
            <li key={idx}>
              <Card className="h-full">
                <CardContent className="space-y-1 p-4">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function getHowItWorks(lang: "en" | "hi") {
  return lang === "hi"
    ? [
        {
          title: "1. लेबल की फ़ोटो लें",
          body: "पैकेट को सीधा पकड़ें और पीछे का हिस्सा कैप्चर करें जहाँ लाइसेंस छपा हो।",
        },
        {
          title: "2. पढ़ी गई जानकारी जाँचें",
          body: "नाम, लाइसेंस और तारीखें जाँचें। जो गलत लगे उसे सुधारें।",
        },
        {
          title: "3. नतीजा देखें",
          body: "ट्रस्ट स्कोर, हर जाँच का परिणाम और सरकारी पोर्टल के लिंक देखें।",
        },
      ]
    : [
        {
          title: "1. Snap the label",
          body: "Hold the packet flat and capture the back of the pack where licences appear.",
        },
        {
          title: "2. Confirm what we found",
          body: "Check the names, licences and dates we read. Fix anything that looks off.",
        },
        {
          title: "3. Get the verdict",
          body: "See a Trust Score, the open checks, and the official portal links to verify yourself.",
        },
      ];
}

function HomeSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="mx-auto h-8 w-48" />
      <Skeleton className="mx-auto h-4 w-80" />
      <Skeleton className="mx-auto h-12 w-72" />
    </div>
  );
}