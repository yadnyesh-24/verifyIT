/**
 * Home: the hero, how it works, and - once a photo is chosen - the preview
 * step where the user checks the shot before we try to read it.
 *
 * There is exactly one "take a photo" action and one "upload" action. The old
 * page had a camera button, an upload button *and* a large dashed drop zone
 * that did the same two things again, which left the page looking empty and
 * the choice looking harder than it is. Dragging still works - it just does not
 * occupy a third of the screen waiting to be used.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Camera,
  Upload,
  RotateCcw,
  ScanLine,
  Building2,
  FileCheck2,
  Languages,
  Check,
  ImageDown,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PageShell } from "@/components/page-shell";
import { PhoneMockup } from "@/components/phone-mockup";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useScan } from "@/lib/scan-store";
import { t } from "@/lib/i18n";
import { MOCK_DESCRIPTIONS, mockKeys } from "@/lib/mocks";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/types";

export default function HomePage() {
  return (
    <PageShell bare>
      <React.Suspense fallback={null}>
        <HomeContent />
      </React.Suspense>
    </PageShell>
  );
}

function HomeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang, photo, photoUrl, setPhoto, reset } = useScan();
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const mock = params.get("mock");
  const showDemoMenu = params.get("demo") === "1";
  const query = mock ? `?mock=${mock}` : "";

  // A fresh visit to the home page starts a new scan: leaving the previous
  // result in memory would let the results screen show it again after a retake.
  React.useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const pick = React.useCallback(
    (file: File | undefined | null) => {
      if (file && file.type.startsWith("image/")) setPhoto(file);
    },
    [setPhoto],
  );

  const dragging = useFileDrop(pick);

  if (photo && photoUrl) {
    return (
      <PreviewStep
        lang={lang}
        url={photoUrl}
        onRetake={() => {
          setPhoto(null);
          cameraRef.current?.click();
        }}
        onRead={() => router.push(`/scanning${query}`)}
      />
    );
  }

  return (
    <>
      <DropOverlay lang={lang} active={dragging} />

      <section className="hero-glow">
        <div className="shell grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-20">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1.5 text-xs font-semibold text-primary-hover">
              <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
              {t(lang, "home.eyebrow")}
            </span>

            <h1 className="text-h1 font-extrabold text-foreground lg:text-h1-lg">
              {t(lang, "home.headlineLead")}{" "}
              <span className="text-primary">{t(lang, "home.headlineAccent")}</span>
              {t(lang, "home.headlineTail")}
            </h1>

            <p className="max-w-xl text-base text-muted-foreground lg:text-lg">
              {t(lang, "home.subline")}
            </p>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button
                size="xl"
                className="w-full sm:w-auto"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="h-5 w-5" aria-hidden="true" />
                {t(lang, "app.scanLabel")}
              </Button>
              <Button
                size="xl"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => uploadRef.current?.click()}
              >
                <Upload className="h-5 w-5" aria-hidden="true" />
                {t(lang, "app.uploadPhoto")}
              </Button>
            </div>

            {/* Desktop-only: a one-line hint, not a large empty target. */}
            <p className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
              <ImageDown className="h-4 w-4" aria-hidden="true" />
              {t(lang, "home.dragHint")}
            </p>

            <ul className="flex flex-wrap gap-2 pt-2">
              {[
                { icon: Building2, key: "home.trustCompany" },
                { icon: FileCheck2, key: "home.trustFormats" },
                { icon: Languages, key: "home.trustLangs" },
              ].map(({ icon: Icon, key }) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground shadow-card"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {t(lang, key as "home.trustCompany")}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-center lg:justify-end">
            <PhoneMockup lang={lang} />
          </div>
        </div>
      </section>

      <HowItWorks lang={lang} />

      {showDemoMenu ? <DemoMenu lang={lang} /> : null}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={t(lang, "app.scanLabel")}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={t(lang, "app.uploadPhoto")}
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </>
  );
}

/** Steps 1-3, joined by a dotted rule on desktop. */
function HowItWorks({ lang }: { lang: Lang }) {
  const steps = [
    { icon: Camera, title: "home.step1Title", body: "home.step1Body" },
    { icon: Check, title: "home.step2Title", body: "home.step2Body" },
    { icon: FileCheck2, title: "home.step3Title", body: "home.step3Body" },
  ] as const;

  return (
    <section className="shell py-12 sm:py-16" aria-labelledby="how-it-works">
      <h2
        id="how-it-works"
        className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl"
      >
        {t(lang, "home.howItWorksTitle")}
      </h2>

      <div className="relative mt-10">
        {/* The connector sits behind the cards and is decorative only. */}
        <div
          aria-hidden="true"
          className="absolute left-[16.6%] right-[16.6%] top-[3.25rem] hidden border-t-2 border-dotted border-primary/30 lg:block"
        />
        <ol className="relative grid grid-cols-1 gap-5 lg:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <Card interactive className="h-full">
                <CardContent className="flex flex-col items-center p-6 text-center">
                  <span className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-primary-soft text-primary ring-8 ring-background">
                    <Icon className="h-8 w-8" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 text-lg font-bold tracking-tight">
                    {t(lang, title)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t(lang, body)}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Check the shot before we spend thirty seconds failing to read a blurred one. */
function PreviewStep({
  lang,
  url,
  onRetake,
  onRead,
}: {
  lang: Lang;
  url: string;
  onRetake: () => void;
  onRead: () => void;
}) {
  const tips = [
    "preview.tipFlat",
    "preview.tipSharp",
    "preview.tipLicence",
    "preview.tipGlare",
  ] as const;

  return (
    <div className="shell py-8 sm:py-12">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        {t(lang, "preview.title")}
      </h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <Image
            src={url}
            alt=""
            width={1200}
            height={900}
            unoptimized
            className="h-auto w-full object-contain"
          />
        </div>

        <div className="flex flex-col gap-5">
          <ul className="space-y-2.5">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="text-base text-muted-foreground">{t(lang, tip)}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="xl" className="w-full sm:w-auto" onClick={onRead}>
              <ScanLine className="h-5 w-5" aria-hidden="true" />
              {t(lang, "preview.readLabel")}
            </Button>
            <Button
              size="xl"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={onRetake}
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              {t(lang, "app.retake")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Track a file drag anywhere on the page.
 *
 * `dragenter` and `dragleave` fire for every element the pointer crosses, so a
 * naive listener flickers the overlay as it moves between children. Counting
 * enters against leaves in a ref - and only showing the overlay on the
 * transition to and from zero - is what makes it stable.
 */
function useFileDrop(onFile: (file: File | undefined) => void) {
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);

  React.useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();

    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth.current += 1;
      if (depth.current === 1) setDragging(true);
    };

    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      onFile(e.dataTransfer?.files?.[0]);
    };

    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFile]);

  return dragging;
}

function DropOverlay({ lang, active }: { lang: Lang; active: boolean }) {
  const reduceMotion = useReducedMotion();
  if (!active) return null;
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.15 }}
      className="fixed inset-0 z-50 grid place-items-center bg-primary/15 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-card-hover">
        <ImageDown className="mx-auto h-10 w-10 text-primary" />
        <p className="mt-3 text-lg font-bold">{t(lang, "home.dropNow")}</p>
      </div>
    </motion.div>
  );
}

/** Only reachable with `?demo=1`, so a real user never sees canned verdicts. */
function DemoMenu({ lang }: { lang: Lang }) {
  return (
    <section className="shell pb-16" aria-label="Demo presets">
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          {mockKeys.map((key) => (
            <a
              key={key}
              href={`/?demo=1&mock=${key}`}
              className={cn(
                "rounded-xl border border-border bg-card p-4 transition-colors",
                "hover:border-primary/40 hover:bg-primary-soft/30",
              )}
            >
              <span className="block text-base font-bold capitalize">{key}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {MOCK_DESCRIPTIONS[key][lang]}
              </span>
            </a>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
