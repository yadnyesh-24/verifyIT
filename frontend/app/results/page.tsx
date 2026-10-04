/**
 * Results page.
 *
 * Renders the `VerifyResponse` the backend returned. If no results are
 * available (e.g. someone landed on `/results` without scanning), we route them
 * to the home page with a toast.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Copy, ExternalLink, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/score-gauge";
import { useScan } from "@/lib/scan-store";
import { t, tRole } from "@/lib/i18n";
import type {
  Check,
  Flag,
  Lang,
  PartyRole,
  VerifyResponse,
} from "@/lib/types";

const SEVERITY_CLASS: Record<Flag["severity"], string> = {
  high: "border-destructive/50 bg-destructive/10 text-destructive",
  medium: "border-warning/50 bg-warning/10 text-warning",
  low: "border-border bg-muted/50 text-muted-foreground",
};

export default function ResultsPage() {
  return (
    <ErrorBoundary>
      <Header />
      <main className="container py-6 sm:py-10">
        <React.Suspense fallback={<ResultsSkeleton />}>
          <ResultsContent />
        </React.Suspense>
      </main>
    </ErrorBoundary>
  );
}

function ResultsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const mockParam = params.get("mock");
  const { lang, results, parties, reset } = useScan();

  React.useEffect(() => {
    if (!results) {
      router.replace(`/${mockParam ? `?mock=${mockParam}` : ""}`);
    }
  }, [results, router, mockParam]);

  if (!results) return null;

  const scanAnother = () => {
    reset();
    router.push(`/${mockParam ? `?mock=${mockParam}` : ""}`);
  };

  const copyAndOpen = async (url: string, copy: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copy);
      }
    } catch {
      /* clipboard blocked - still open the portal */
    }
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success(t(lang, "results.numberCopied"));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="sr-only">{t(lang, "results.title")}</h1>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <ScoreGauge score={results.score} lang={lang} />
          {results.verdict === "not_checked" ? (
            <p className="text-center text-sm text-muted-foreground">
              {t(lang, "results.verdictPending")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section
        aria-label="Checks"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {results.checks.map((check) => (
          <CheckCard key={check.id} check={check} lang={lang} />
        ))}
      </section>

      <FlagsByParty results={results} lang={lang} parties={parties} />

      {results.official_links.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Official portals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.official_links.map((link, i) => (
              <div
                key={`${link.url}-${i}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {link.copy}
                  </p>
                </div>
                <Button onClick={() => copyAndOpen(link.url, link.copy)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {t(lang, "results.openPortal")}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mr-2 inline-block h-3.5 w-3.5" aria-hidden="true" />
        {t(lang, "results.disclaimer")}
      </p>

      <div className="flex justify-center gap-2 pt-2">
        <Button variant="outline" onClick={scanAnother}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t(lang, "results.scanAnother")}
        </Button>
      </div>
    </div>
  );
}

function CheckCard({ check, lang }: { check: Check; lang: Lang }) {
  const title =
    check.id === "company"
      ? t(lang, "results.company")
      : check.id === "licence"
        ? t(lang, "results.licence")
        : t(lang, "results.labelRules");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <StatusBadge status={check.status} lang={lang} />
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          {check.flags.length === 0
            ? "No flags."
            : `${check.flags.length} flag${check.flags.length === 1 ? "" : "s"}`}
        </p>
      </CardContent>
    </Card>
  );
}

interface PartyLite {
  role: PartyRole;
  name: { value: string | null } | null;
}

interface FlagsProps {
  results: VerifyResponse;
  lang: Lang;
  parties: PartyLite[];
}

function FlagsByParty({ results, lang, parties }: FlagsProps) {
  // Bucket flags by `evidence.party` (the index into the parties array we sent).
  // Anything without a party index falls into the "General" bucket.
  const buckets = new Map<number | "general", Flag[]>();
  results.checks.forEach((c) =>
    c.flags.forEach((f) => {
      const idx =
        f.evidence && typeof f.evidence === "object"
          ? (f.evidence as Record<string, unknown>).party
          : undefined;
      const key =
        typeof idx === "number" && Number.isInteger(idx) && idx >= 0
          ? idx
          : "general";
      const arr = buckets.get(key) ?? [];
      arr.push(f);
      buckets.set(key, arr);
    }),
  );

  if (buckets.size === 0) return null;

  const entries: Array<{
    key: number | "general";
    title: string;
    flags: Flag[];
  }> = [];
  for (const [key, flags] of buckets.entries()) {
    if (key === "general") {
      entries.push({ key, title: "General", flags });
    } else {
      const party = parties[key];
      const title = party
        ? `${tRole(lang, party.role)}${
            party.name?.value ? ` - ${party.name.value}` : ""
          }`
        : `Party ${key + 1}`;
      entries.push({ key, title, flags });
    }
  }

  return (
    <section aria-label="Flags" className="space-y-3">
      {entries.map((entry) => (
        <Card key={String(entry.key)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t(lang, "results.flagsFor")} {entry.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entry.flags.map((flag) => (
              <div
                key={flag.code}
                className={`rounded-md border p-3 text-sm ${SEVERITY_CLASS[flag.severity]}`}
              >
                <p className="font-medium">
                  {flag.code} ({flag.severity})
                </p>
                <p className="mt-1">{lang === "hi" ? flag.hi : flag.en}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="mx-auto h-44 w-44 rounded-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}