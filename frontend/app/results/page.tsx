/**
 * Results page.
 *
 * Renders the `VerifyResponse` from the backend (or a mock). The score
 * gauge animates from 0 to the value; `score: null` shows "—" + the score-
 * pending label. Flags are grouped by party (via `evidence.party`) and shown
 * using the EN/HI text for the current toggle.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, ExternalLink, RotateCcw, PencilLine, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { StepIndicator } from "@/components/step-indicator";
import { StatusBadge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/score-gauge";
import { useScan } from "@/lib/scan-store";
import { t, tRole } from "@/lib/i18n";
import type {
  Check,
  Flag,
  Lang,
  Party,
  PartyRole,
  ScanResponse,
  VerifyResponse,
} from "@/lib/contract";
import { normaliseStatus } from "@/lib/contract";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<Flag["severity"], string> = {
  high: "border-risk/30 bg-risk/5",
  medium: "border-warn/30 bg-warn/5",
  low: "border-hairline bg-surface-2",
};

const SEVERITY_DOT: Record<Flag["severity"], string> = {
  high: "bg-risk",
  medium: "bg-warn",
  low: "bg-muted",
};

const CHECK_TITLE: Record<"company" | "licence" | "label_law", string> = {
  company: "results.company",
  licence: "results.licence",
  label_law: "results.labelRules",
};

export default function ResultsPage() {
  return (
    <ErrorBoundary>
      <Header />
      <main className="container py-6 sm:py-10">
        <React.Suspense fallback={null}>
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
  const { lang, results, parties, scan, reset } = useScan();

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
  const editDetails = () => {
    router.push(`/review${mockParam ? `?mock=${mockParam}` : ""}`);
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
      <StepIndicator />
      <h1 className="sr-only">{t(lang, "results.title")}</h1>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:p-8">
          <ScoreGauge
            score={results.score}
            verdict={results.verdict}
            basis={results.score_basis}
            lang={lang}
          />
        </CardContent>
      </Card>

      <section
        aria-label={t(lang, "results.checksTitle")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {results.checks.map((check) => (
          <CheckCard key={check.id} check={check} lang={lang} />
        ))}
      </section>

      <FlagsByParty results={results} parties={parties} scan={scan} lang={lang} />

      {results.official_links.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t(lang, "results.openPortal")}
            </CardTitle>
            <p className="text-xs text-muted">{t(lang, "results.portalHint")}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.official_links.map((link, i) => (
              <div
                key={`${link.url}-${i}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-btn border bg-surface p-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="font-mono text-xs text-muted">{link.copy}</p>
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

      <p className="flex items-start gap-1.5 rounded-md border bg-surface px-3 py-2 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t(lang, "results.disclaimer")}</span>
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={editDetails} className="sm:w-auto">
          <PencilLine className="h-4 w-4" aria-hidden="true" />
          {t(lang, "results.editDetails")}
        </Button>
        <Button onClick={scanAnother} className="sm:w-auto">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t(lang, "results.scanAnother")}
        </Button>
      </div>
    </div>
  );
}

function CheckCard({ check, lang }: { check: Check; lang: Lang }) {
  const normalised = normaliseStatus(check.status);
  const title = t(lang, CHECK_TITLE[check.id]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        <StatusBadge status={normalised} lang={lang} />
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted">
          {check.flags.length === 0
            ? "No flags."
            : `${check.flags.length} flag${check.flags.length === 1 ? "" : "s"}`}
        </p>
      </CardContent>
    </Card>
  );
}

interface FlagsProps {
  results: VerifyResponse;
  parties: Party[];
  scan: ScanResponse | null;
  lang: Lang;
}

function FlagsByParty({ results, parties, scan, lang }: FlagsProps) {
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

  // Also build a quick map of party_id -> index for resolving evidence by id.
  const indexById = new Map<string, number>();
  parties.forEach((p, i) => indexById.set(p.id, i));

  const entries: Array<{
    key: number | "general";
    title: string;
    flags: Flag[];
  }> = [];
  for (const [key, flags] of buckets.entries()) {
    if (key === "general") {
      entries.push({ key, title: t(lang, "results.flagsGeneral"), flags });
    } else {
      const party = parties[key];
      const title = party
        ? `${tRole(lang, party.role)}${
            party.name.value ? ` - ${party.name.value}` : ""
          }`
        : `Party ${key + 1}`;
      entries.push({ key, title, flags });
    }
  }

  void indexById;
  void scan;

  return (
    <section aria-label={t(lang, "results.flagsFor")} className="space-y-3">
      {entries.map((entry) => (
        <Card key={String(entry.key)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t(lang, "results.flagsFor")} {entry.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entry.flags.map((flag) => (
              <FlagCard
                key={flag.code + flag.severity}
                flag={flag}
                lang={lang}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function FlagCard({ flag, lang }: { flag: Flag; lang: Lang }) {
  return (
    <div
      className={`rounded-btn border p-3 text-sm ${SEVERITY_STYLE[flag.severity]}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT[flag.severity]}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {flag.code} · {flag.severity}
        </span>
      </div>
      <p className="mt-1.5 text-ink">
        {lang === "hi" ? flag.hi : flag.en}
      </p>
      {flag.evidence && Object.keys(flag.evidence).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(flag.evidence)
            .filter(([k]) => k !== "party" && k !== "role")
            .map(([k, v]) => (
              <span
                key={k}
                className="rounded-full bg-surface px-2 py-0.5 font-mono text-xs text-muted"
              >
                {k}: {String(v)}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}