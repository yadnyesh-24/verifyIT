/**
 * Results: the score, the three checks, what was flagged, and how to confirm
 * any of it yourself.
 *
 * The screen is built so that "we could not check this" always reads as
 * pending. `not_checked` gets a grey "Verification pending" badge and no score
 * contribution; a null score shows an em dash. Nothing here upgrades an absence
 * of evidence into a verdict.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  FileCheck2,
  ScrollText,
  Copy,
  ExternalLink,
  RotateCcw,
  PencilLine,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, SeverityDot } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/score-gauge";
import { useScan } from "@/lib/scan-store";
import { t, tRole } from "@/lib/i18n";
import type { Check, CheckId, Flag, Lang, Party, VerifyResponse } from "@/lib/types";

const CHECK_META: Record<CheckId, { icon: typeof Building2; title: Parameters<typeof t>[1] }> = {
  company: { icon: Building2, title: "results.company" },
  licence: { icon: FileCheck2, title: "results.licence" },
  label_law: { icon: ScrollText, title: "results.labelRules" },
};

export default function ResultsPage() {
  return (
    <PageShell className="pb-32">
      <React.Suspense fallback={null}>
        <ResultsContent />
      </React.Suspense>
    </PageShell>
  );
}

function ResultsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang, results, draft, reset } = useScan();

  const mock = params.get("mock");
  const query = mock ? `?mock=${mock}` : "";

  // Nothing to show means they never verified - send them back to start.
  React.useEffect(() => {
    if (!results) router.replace(`/${query}`);
  }, [results, router, query]);

  if (!results) return null;

  return (
    <>
      <h1 className="sr-only">{t(lang, "results.title")}</h1>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-2 p-8 sm:p-10">
          <ScoreGauge
            score={results.score}
            verdict={results.verdict}
            checksRan={results.checks_ran}
            lang={lang}
          />
          {results.verdict === "not_checked" ? (
            <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
              {t(lang, "results.verdictPending")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section aria-label={t(lang, "results.title")} className="mt-6 grid gap-4 sm:grid-cols-3">
        {results.checks.map((check) => (
          <CheckCard key={check.id} check={check} lang={lang} />
        ))}
      </section>

      <FlagGroups results={results} parties={draft?.parties ?? []} lang={lang} />

      {results.official_links.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t(lang, "results.officialTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t(lang, "results.officialBody")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.official_links.map((link, index) => (
              <Button
                key={`${link.url}-${index}`}
                variant="outline"
                size="xl"
                className="h-auto w-full justify-between gap-4 px-5 py-4 text-left"
                onClick={() => copyAndOpen(link.url, link.copy, lang)}
              >
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="text-base font-bold">{link.label}</span>
                  <span className="truncate font-mono text-sm font-normal text-muted-foreground">
                    {link.copy}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary">
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {t(lang, "results.openPortal")}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-6 flex gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 translate-y-0.5" aria-hidden="true" />
        {t(lang, "results.disclaimer")}
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur-md">
        <div className="shell flex flex-col gap-3 py-3 sm:flex-row sm:justify-end">
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push(`/review${query}`)}
          >
            <PencilLine className="h-5 w-5" aria-hidden="true" />
            {t(lang, "results.editDetails")}
          </Button>
          <Button
            size="lg"
            onClick={() => {
              reset();
              router.push(`/${query}`);
            }}
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            {t(lang, "results.scanAnother")}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Copy the number, then open the portal.
 *
 * The clipboard write is attempted first but never blocks the navigation: a
 * browser that denies clipboard access should still get the user to the portal,
 * where they can type the number by hand.
 */
async function copyAndOpen(url: string, text: string, lang: Lang) {
  let copied = false;
  try {
    await navigator.clipboard?.writeText(text);
    copied = true;
  } catch {
    /* clipboard denied - the portal still opens */
  }
  window.open(url, "_blank", "noopener,noreferrer");
  if (copied) toast.success(t(lang, "results.numberCopied"));
}

function CheckCard({ check, lang }: { check: Check; lang: Lang }) {
  const meta = CHECK_META[check.id as CheckId];
  const Icon = meta?.icon ?? ScrollText;

  return (
    <Card interactive className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
        <h2 className="text-lg font-bold tracking-tight">
          {meta ? t(lang, meta.title) : check.id}
        </h2>
        <StatusBadge status={check.status} lang={lang} className="self-start" />
      </CardContent>
    </Card>
  );
}

/**
 * Flags, grouped by the party they concern.
 *
 * The backend tags a flag with `evidence.party` (an index into the parties the
 * client sent) when it can attribute it. Anything unattributed goes to a
 * "General" group rather than being pinned on the first company on the pack.
 */
function FlagGroups({
  results,
  parties,
  lang,
}: {
  results: VerifyResponse;
  parties: Party[];
  lang: Lang;
}) {
  const groups = new Map<number | "general", Flag[]>();

  for (const check of results.checks) {
    for (const flag of check.flags) {
      const raw = flag.evidence?.party;
      const key =
        typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : "general";
      groups.set(key, [...(groups.get(key) ?? []), flag]);
    }
  }

  if (groups.size === 0) return null;

  const title = (key: number | "general") => {
    if (key === "general") return t(lang, "results.general");
    const party = parties[key];
    if (!party) return `${t(lang, "results.general")} ${key + 1}`;
    return `${tRole(lang, party.role)}${party.name.value ? ` — ${party.name.value}` : ""}`;
  };

  return (
    <section aria-label={t(lang, "results.flagsFor")} className="mt-6 space-y-4">
      {[...groups.entries()].map(([key, flags]) => (
        <Card key={String(key)}>
          <CardHeader>
            <CardTitle className="text-base">
              {t(lang, "results.flagsFor")} {title(key)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {flags.map((flag) => (
              <div
                key={flag.code}
                className="flex gap-3 rounded-xl border border-border p-4"
              >
                <SeverityDot severity={flag.severity} />
                <div className="min-w-0 space-y-2">
                  <p className="text-base leading-relaxed">
                    {lang === "hi" ? flag.hi : flag.en}
                  </p>
                  <EvidenceChips evidence={flag.evidence} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

/** `party` is a routing hint for this screen, not a finding - so it is not shown. */
const HIDDEN_EVIDENCE = new Set(["party"]);

function EvidenceChips({ evidence }: { evidence: Record<string, unknown> | null }) {
  if (!evidence) return null;
  const entries = Object.entries(evidence).filter(
    ([key, value]) =>
      !HIDDEN_EVIDENCE.has(key) && value !== null && value !== undefined && value !== "",
  );
  if (entries.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <li
          key={key}
          className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
        >
          <span className="font-semibold">{key.replace(/_/g, " ")}:</span>{" "}
          <span className="font-mono">{String(value)}</span>
        </li>
      ))}
    </ul>
  );
}
