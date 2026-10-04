/**
 * Review page. Lets the user confirm/edit what we read, then POSTs to
 * `/api/verify` (mock-aware) when they press Verify.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Select } from "@/components/ui/select";
import { useScan, makeBlankParty } from "@/lib/scan-store";
import { ProductDetailsCard } from "@/components/product-details-card";
import { PartyCard } from "@/components/party-card";
import { toVerifyBody, verifyItem } from "@/lib/api";
import { t, tRole } from "@/lib/i18n";
import type { Party, ProductFieldKey } from "@/lib/types";

const ROLE_ORDER: Party["role"][] = [
  "marketer",
  "manufacturer",
  "packer",
  "importer",
];

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
    setScan,
    setPartyRole,
    setFieldOnParty,
    removeParty,
    addParty,
    attachLicence,
    setResults,
  } = useScan();
  const [submitting, setSubmitting] = React.useState(false);
  void setResults;

  if (!scan) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-semibold">{t(lang, "review.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(lang, "review.noFields")}
        </p>
        <Button asChild className="mt-4">
          <Link href="/">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t(lang, "review.manualEntry")}
          </Link>
        </Button>
      </div>
    );
  }

  const sortedParties = [...parties].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  // Reuses `setScan` so the in-memory scan object stays in sync with edits.
  const updateProductField = (key: ProductFieldKey, value: string | null) => {
    const next = {
      ...scan,
      fields: {
        ...scan.fields,
        product: {
          ...scan.fields.product,
          [key]: {
            value,
            confidence: 1,
            uncertain: false,
            source: "user" as const,
          },
        },
      },
    };
    setScan(next, parties);
  };

  const onVerify = async () => {
    setSubmitting(true);
    try {
      const body = toVerifyBody(scan, parties);
      const result = await verifyItem(body, mockParam);
      setResults(result);
      router.push(`/results${mockParam ? `?mock=${mockParam}` : ""}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : t(lang, "scanning.networkError");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const noContent =
    parties.length === 0 &&
    scan.fields.unassigned_licences.length === 0 &&
    Object.values(scan.fields.product).every((v) => !v?.value);

  if (noContent) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t(lang, "review.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(lang, "review.noFields")}
        </p>
        <div className="flex justify-center gap-2">
          <Button
            onClick={() => addParty(makeBlankParty("manufacturer"))}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t(lang, "review.manualEntry")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t(lang, "app.retake")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "review.title")}
        </h1>
      </header>

      <ProductDetailsCard
        fields={scan.fields.product}
        lang={lang}
        onChange={(key, value) => updateProductField(key, value)}
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
                setFieldOnParty(party.id, field, value)
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
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">
              {t(lang, "review.unassignedLicences")}
            </h2>
            <ul className="space-y-2">
              {scan.fields.unassigned_licences.map((licence, i) => (
                <li
                  key={`${licence.value ?? "null"}-${i}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3"
                >
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">
                    {licence.value ?? "—"}
                  </code>
                  <span className="text-sm text-muted-foreground">
                    {t(lang, "review.attachToParty")}
                  </span>
                  <Select
                    aria-label={t(lang, "review.attachToParty")}
                    className="h-9 max-w-xs"
                    onChange={(e) => {
                      const partyId = e.target.value;
                      if (partyId) attachLicence(i, partyId);
                    }}
                    defaultValue=""
                  >
                    <option value="">—</option>
                    {sortedParties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {tRole(lang, p.role)}
                        {p.unit_code.value ? ` - ${p.unit_code.value}` : ""}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-0 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline" className="sm:w-auto">
            <Link href="/">{t(lang, "app.retake")}</Link>
          </Button>
          <Button
            size="lg"
            onClick={onVerify}
            disabled={submitting}
            className="sm:w-auto"
          >
            {submitting ? t(lang, "common.loading") : t(lang, "review.verify")}
          </Button>
        </div>
      </div>
    </div>
  );
}