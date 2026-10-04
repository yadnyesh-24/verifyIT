/**
 * Review: confirm what we read, then verify.
 *
 * The screen exists because the backend checks *confirmed* values, not guesses.
 * Anything the reader was unsure about is marked rather than quietly accepted,
 * and a field the pack genuinely does not print is left blank on purpose - the
 * label-law checker needs to tell "not printed" apart from "not filled in".
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Plus, ShieldCheck, ChevronDown, Ticket } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ProductDetailsCard } from "@/components/product-details-card";
import { PartyCard } from "@/components/party-card";
import { useScan } from "@/lib/scan-store";
import { toVerifyBody, verifyItem } from "@/lib/api";
import { t, tRole } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/types";

export default function ReviewPage() {
  return (
    <PageShell className="shell py-8 pb-32 sm:py-12">
      <React.Suspense fallback={null}>
        <ReviewContent />
      </React.Suspense>
    </PageShell>
  );
}

function ReviewContent() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    lang,
    draft,
    photoUrl,
    setProductField,
    setPartyField,
    setPartyRole,
    addParty,
    removeParty,
    attachLicence,
    setResults,
    startEmptyDraft,
  } = useScan();

  const mock = params.get("mock");
  const query = mock ? `?mock=${mock}` : "";
  const [submitting, setSubmitting] = React.useState(false);

  // Landing here directly (a refresh, a shared link) leaves nothing to review.
  // Give them an empty form rather than an error - the form is useful on its own.
  React.useEffect(() => {
    if (!draft) startEmptyDraft();
  }, [draft, startEmptyDraft]);

  if (!draft) return null;

  const onVerify = async () => {
    setSubmitting(true);
    try {
      const result = await verifyItem(toVerifyBody(draft), mock);
      setResults(result);
      router.push(`/results${query}`);
    } catch (err) {
      toast.error(
        err instanceof DOMException && err.name === "AbortError"
          ? t(lang, "scanning.timeout")
          : t(lang, "scanning.networkError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="max-w-2xl">
        <h1 className="text-h1 font-extrabold tracking-tight">
          {t(lang, "review.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t(lang, "review.subtitle")}
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-8">
        <PhotoPanel url={photoUrl} lang={lang} />

        <div className="space-y-5">
          <ProductDetailsCard
            product={draft.product}
            lang={lang}
            onChange={setProductField}
          />

          <section aria-label={t(lang, "review.partiesTitle")} className="space-y-5">
            <h2 className="text-xl font-extrabold tracking-tight">
              {t(lang, "review.partiesTitle")}
            </h2>
            {draft.parties.map((party) => (
              <PartyCard
                key={party.id}
                party={party}
                lang={lang}
                canRemove={draft.parties.length > 1}
                onRoleChange={(role) => setPartyRole(party.id, role)}
                onFieldChange={(key, value) => setPartyField(party.id, key, value)}
                onRemove={() => removeParty(party.id)}
              />
            ))}

            <Button variant="outline" size="lg" onClick={() => addParty()}>
              <Plus className="h-5 w-5" aria-hidden="true" />
              {t(lang, "review.addParty")}
            </Button>
          </section>

          {draft.unassigned_licences.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                  <Ticket className="h-5 w-5" aria-hidden="true" />
                </span>
                <CardTitle>{t(lang, "review.unassignedLicences")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft.unassigned_licences.map((licence, index) => (
                  <div
                    key={`${licence.field.value ?? "null"}-${index}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3.5"
                  >
                    <code className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm">
                      {licence.field.value ?? "—"}
                    </code>
                    <Select
                      className="h-11 max-w-[16rem] flex-1 text-sm"
                      defaultValue=""
                      aria-label={t(lang, "review.attachToParty")}
                      onChange={(e) => {
                        if (e.target.value) attachLicence(index, e.target.value);
                      }}
                    >
                      <option value="">{t(lang, "review.attachToParty")}…</option>
                      {draft.parties.map((party) => (
                        <option key={party.id} value={party.id}>
                          {tRole(lang, party.role)}
                          {party.unit_code.value ? ` · ${party.unit_code.value}` : ""}
                          {party.name.value ? ` — ${party.name.value}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Always reachable without scrolling back up, on every breakpoint. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur-md">
        <div className="shell flex items-center justify-end gap-3 py-3">
          <Button
            size="xl"
            className="w-full sm:w-auto"
            onClick={onVerify}
            disabled={submitting}
          >
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            {submitting ? t(lang, "common.loading") : t(lang, "review.verify")}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * The photo, kept beside the fields.
 *
 * On desktop it sticks, so the user can read a blurred number off the picture
 * while typing it. On mobile there is no room for both, so it collapses - shut
 * by default, because the keyboard matters more than the picture on a phone.
 */
function PhotoPanel({ url, lang }: { url: string | null; lang: Lang }) {
  const [open, setOpen] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  if (!url) return <div className="hidden lg:block" />;

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-card px-4 text-base font-semibold lg:hidden"
      >
        {open ? t(lang, "review.hidePhoto") : t(lang, "review.showPhoto")}
        <ChevronDown
          className={cn("h-5 w-5 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <div className={cn("mt-3 lg:mt-0", open ? "block" : "hidden lg:block")}>
        <button
          type="button"
          onClick={() => setZoomed((v) => !v)}
          aria-label={zoomed ? "Zoom out" : "Zoom in"}
          className="block w-full overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        >
          <Image
            src={url}
            alt=""
            width={900}
            height={1200}
            unoptimized
            className={cn(
              "h-auto w-full origin-center object-contain transition-transform duration-300",
              zoomed && "scale-150",
            )}
          />
        </button>
      </div>
    </div>
  );
}
