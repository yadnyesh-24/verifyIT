/**
 * Product details card. One row per product-level field (MRP, net quantity,
 * customer care, dates, BIS/IS numbers). Each value is editable inline.
 */
"use client";

import * as React from "react";
import { Pencil, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { Lang, ProductFieldKey, ScanField } from "@/lib/types";

const FIELD_LABELS: Record<ProductFieldKey, { en: string; hi: string }> = {
  mrp: { en: "MRP", hi: "MRP" },
  net_quantity: { en: "Net quantity", hi: "कुल मात्रा" },
  customer_care: { en: "Customer care", hi: "ग्राहक सेवा" },
  mfg_date: { en: "Manufactured", hi: "निर्माण तिथि" },
  expiry_or_best_before: { en: "Expiry / Best before", hi: "समाप्ति / बेस्ट बिफोर" },
  bis_cml: { en: "BIS CML", hi: "BIS CML" },
  is_number: { en: "IS number", hi: "IS नंबर" },
};

const ORDER: ProductFieldKey[] = [
  "mrp",
  "net_quantity",
  "customer_care",
  "mfg_date",
  "expiry_or_best_before",
  "bis_cml",
  "is_number",
];

interface Props {
  fields: Partial<Record<ProductFieldKey, ScanField | null>>;
  lang: Lang;
  onChange: (key: ProductFieldKey, value: string | null) => void;
}

export function ProductDetailsCard({ fields, lang, onChange }: Props) {
  const [editing, setEditing] = React.useState<ProductFieldKey | null>(null);
  const [draft, setDraft] = React.useState<string>("");

  const startEdit = (key: ProductFieldKey, current: string | null) => {
    setDraft(current ?? "");
    setEditing(key);
  };

  const commit = () => {
    if (!editing) return;
    onChange(editing, draft.trim().length > 0 ? draft.trim() : null);
    setEditing(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(lang, "review.productDetails")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ORDER.map((key) => {
            const scanField = fields[key] ?? null;
            const label = FIELD_LABELS[key][lang];
            const isEditing = editing === key;
            const display = scanField?.value ?? t(lang, "review.notFound");
            return (
              <div
                key={key}
                className={cn(
                  "rounded-md border bg-background p-3",
                  scanField?.uncertain && "border-warning/60 bg-warning/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <div className="flex items-center gap-2">
                    {scanField?.uncertain && scanField.value !== null ? (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warning">
                        {t(lang, "review.pleaseCheck")}
                      </span>
                    ) : null}
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEdit(key, scanField?.value ?? null)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                        aria-label={`${t(lang, "review.editValue")} ${label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={commit}
                        className="rounded-md p-1 text-success hover:bg-success/10"
                        aria-label={`Save ${label}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <dd className="mt-1.5 text-sm">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      aria-label={label}
                    />
                  ) : scanField?.value ? (
                    <span className="font-medium text-foreground">{display}</span>
                  ) : (
                    <span className="text-muted-foreground">{display}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}