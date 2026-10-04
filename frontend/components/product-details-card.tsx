/**
 * Product details card. One row per product-level field (MRP, net quantity,
 * customer care, dates, BIS / IS numbers). Each value is editable inline; an
 * "OCR / AI / Both" chip is shown when the value came from the backend.
 */
"use client";

import * as React from "react";
import { Pencil, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type {
  Lang,
  ProductFieldKey,
  ScanField,
} from "@/lib/contract";

const FIELDS: { key: ProductFieldKey; label: string }[] = [
  { key: "mrp", label: "MRP" },
  { key: "net_quantity", label: "Net quantity" },
  { key: "customer_care", label: "Customer care" },
  { key: "mfg_date", label: "Manufactured" },
  { key: "expiry_or_best_before", label: "Expiry / Best before" },
  { key: "bis_cml", label: "BIS CML" },
  { key: "is_number", label: "IS number" },
];

interface Props {
  fields: Partial<Record<ProductFieldKey, ScanField | null>>;
  lang: Lang;
  onChange: (key: ProductFieldKey, value: string | null) => void;
}

function sourceLabel(lang: Lang, s: ScanField["source"]): string | null {
  if (s === "ocr") return t(lang, "review.source.ocr");
  if (s === "llm") return t(lang, "review.source.ai");
  if (s === "both") return t(lang, "review.source.both");
  if (s === "user") return t(lang, "common.saved");
  return null;
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
          {FIELDS.map(({ key, label }) => {
            const scanField = fields[key] ?? null;
            const isEditing = editing === key;
            const display = scanField?.value ?? t(lang, "review.notFound");
            const sourceText = scanField ? sourceLabel(lang, scanField.source) : null;
            return (
              <div
                key={key}
                className={cn(
                  "rounded-btn border bg-surface p-3",
                  scanField?.uncertain && "border-warn/60 bg-warn/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {label}
                  </dt>
                  <div className="flex items-center gap-1.5">
                    {sourceText ? (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                        {sourceText}
                      </span>
                    ) : null}
                    {scanField?.uncertain && scanField.value !== null ? (
                      <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warn">
                        {t(lang, "review.pleaseCheck")}
                      </span>
                    ) : null}
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEdit(key, scanField?.value ?? null)}
                        className="control-min grid place-items-center rounded-md p-1 text-muted hover:bg-muted hover:text-ink"
                        aria-label={`${t(lang, "review.editValue")} ${label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={commit}
                        className="control-min grid place-items-center rounded-md p-1 text-pass hover:bg-pass/10"
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
                        if (e.key === "Escape") commit();
                      }}
                      aria-label={label}
                    />
                  ) : scanField?.value ? (
                    <span className="font-medium text-ink">{display}</span>
                  ) : (
                    <span className="text-muted">{display}</span>
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