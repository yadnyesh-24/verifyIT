/**
 * Review page.
 *
 * Lets the user confirm / edit what we read and POSTs to /api/verify.
 *
 * Layout:
 *  - Two columns on desktop: photo (zoomable) on the left, fields on the right.
 *  - On mobile the photo collapses into a small toggle at the top.
 *  - One card per party, ordered marketer -> manufacturer -> packer -> importer.
 *  - Unassigned licences get a "Which company is this for?" dropdown.
 *  - Sticky bottom bar on mobile with the Verify CTA.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Eye, EyeOff, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { StepIndicator } from "@/components/step-indicator";
import { ProductDetailsCard } from "@/components/product-details-card";
import { PartyCard } from "@/components/party-card";
import { PhotoCard } from "@/components/photo-card";
import { useScan, makeBlankParty } from "@/lib/scan-store";
import { verify as apiVerify } from "@/lib/api";
import { useDataMode } from "@/lib/data-mode";
import { t, tRole } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  Party,
  PartyRole,
  ProductFieldKey,
} from "@/lib/contract";
import { mockKeys, type MockKey } from "@/lib/mocks";

export const dynamic = "force-dynamic";

const ROLE_ORDER: PartyRole[] = ["marketer", "manufacturer", "packer", "importer"];

export default function ReviewPage() {
  return (
    <ErrorBoundary>
      <Header />
      <main className="container py-6 sm:py-10">
        <React.Suspense fallback={null}>
          <ReviewContent />
        </React.Suspense>
      </main>
    </ErrorBoundary>
  );
}

function ReviewContent() {
  const router = useRouter();
  const params = useSearchParams();
  const mockParam = params.get("mock");
  const {
    lang,
    scan,
    parties,
    photoDataUrl,
    setPartyRole,
    setPartyField,
    setProductField,
    removeParty,
    addParty,
    attachLicence,
    setResults,
  } = useScan();
  const mode = useDataMode();
  const [submitting, setSubmitting] = React.useState(false);
  const [showPhoto, setShowPhoto] = React.useState(true);

  if (!scan) {
    return (
      <div className="mx-auto max-w-md text-center">
        <StepIndicator />
        <h1 className="mt-4 text-xl font-semibold">{t(lang, "review.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t(lang, "review.noFieldsBody")}</p>
        <Button asChild className="mt-4">
          <Link href="/">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t(lang, "hero.takePhoto")}
          </Link>
        </Button>
      </div>
    );
  }

  const sortedParties = [...parties].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  const noContent =
    parties.length === 0 &&
    scan.fields.unassigned_licences.length === 0 &&
    Object.values(scan.fields.product).every((v) => !v?.value);

  if (noContent) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <StepIndicator />
        <h1 className="text-xl font-semibold">{t(lang, "review.noFieldsTitle")}</h1>
        <p className="text-sm text-muted">{t(lang, "review.noFieldsBody")}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => addParty(makeBlankParty("manufacturer"))}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t(lang, "review.addParty")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t(lang, "common.back")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const onVerify = async () => {
    if (!scan) return;
    setSubmitting(true);
    try {
      const result = await apiVerify(
        scan,
        parties,
        mode.mode,
        mockParam && mockKeys.includes(mockParam as never)
          ? (mockParam as MockKey)
          : null,
      );
      setResults(result);
      router.push(`/results${mockParam ? `?mock=${mockParam}` : ""}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : t(lang, "scanning.retry");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <StepIndicator />

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "review.title")}
        </h1>
        <p className="text-sm text-muted">{t(lang, "review.partiesTitle")}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
        <PhotoColumn
          src={photoDataUrl}
          lang={lang}
          show={showPhoto}
          setShow={setShowPhoto}
        />

        <div className="space-y-5">
          <ProductDetailsCard
            fields={scan.fields.product}
            lang={lang}
            onChange={(k: ProductFieldKey, v: string | null) =>
              setProductField(k, v)
            }
          />

          {sortedParties.length > 0 ? (
            <section
              aria-label={t(lang, "review.partiesTitle")}
              className="space-y-3"
            >
              {sortedParties.map((party, idx) => (
                <PartyCard
                  key={party.id}
                  index={idx}
                  party={party}
                  lang={lang}
                  onRoleChange={(role) => setPartyRole(party.id, role)}
                  onFieldChange={(field, value) =>
                    setPartyField(party.id, field, value)
                  }
                  onRemove={() => removeParty(party.id)}
                />
              ))}
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => addParty(makeBlankParty("manufacturer"))}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t(lang, "review.addParty")}
            </Button>
          </div>

          {scan.fields.unassigned_licences.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t(lang, "review.unassignedLicencesTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ul className="space-y-2">
                  {scan.fields.unassigned_licences.map((licence, i) => (
                    <UnassignedLicenceRow
                      key={`${licence.value ?? "null"}-${i}`}
                      licence={licence}
                      parties={sortedParties}
                      lang={lang}
                      onPick={(partyId) => attachLicence(i, partyId)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="hidden sm:flex sm:justify-end">
            <Button
              size="lg"
              onClick={onVerify}
              disabled={submitting}
              className="sm:w-auto"
            >
              {submitting
                ? t(lang, "common.loading")
                : t(lang, "review.verifyNow")}
            </Button>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-6 border-t bg-surface/95 px-4 py-3 backdrop-blur sm:hidden">
        <Button
          size="lg"
          onClick={onVerify}
          disabled={submitting}
          className="w-full"
        >
          {submitting
            ? t(lang, "common.loading")
            : t(lang, "review.verifyNow")}
        </Button>
      </div>
    </div>
  );
}

function PhotoColumn({
  src,
  lang,
  show,
  setShow,
}: {
  src: string | null;
  lang: "en" | "hi";
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  if (!src) return <div className="hidden lg:block" />;
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="mb-2 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="control-min inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 text-sm font-medium text-muted hover:text-ink"
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
          {show ? t(lang, "review.hidePhoto") : t(lang, "review.showPhoto")}
        </button>
      </div>
      <div className={cn(show ? "" : "hidden", "lg:block")}>
        <PhotoCard src={src} alt={t(lang, "hero.photoAlt")} lang={lang} />
      </div>
    </aside>
  );
}

function UnassignedLicenceRow({
  licence,
  parties,
  lang,
  onPick,
}: {
  licence: { value: string | null };
  parties: Party[];
  lang: "en" | "hi";
  onPick: (partyId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-btn border bg-surface p-3">
      <code className="rounded bg-surface-2 px-2 py-0.5 text-xs">
        {licence.value ?? "—"}
      </code>
      <span className="text-sm text-muted">{t(lang, "review.whichCompany")}</span>
      <div className="relative">
        <select
          aria-label={t(lang, "review.whichCompany")}
          className="control-min appearance-none rounded-btn border bg-surface pl-3 pr-9 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onPick(e.target.value);
          }}
        >
          <option value="">{t(lang, "review.noParty")}</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {tRole(lang, p.role)}
              {p.unit_code.value ? ` · ${p.unit_code.value}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
      </div>
    </li>
  );
}