/**
 * One editable field on the review screen.
 *
 * Three signals share this row, and they mean different things:
 *
 * - **Uncertain** (amber edge + "Please check"): the reader produced a value it
 *   is not confident in. The user is the only one who can settle it.
 * - **Source chip** (OCR / AI / Both): where the value came from, so a user can
 *   weigh it. A value the user typed shows no chip - they already know.
 * - **Format hint**: a local, deterministic observation about shape, shown only
 *   once something has been entered. It never says the number is fake, because
 *   a wrong length is just as likely to be a misread as a forgery.
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import type { Lang, ScanField } from "@/lib/types";

/** Shapes that can be checked offline, with no registry involved. */
const FORMATS = {
  fssai: { test: (v: string) => /^\d{14}$/.test(v), hint: "review.hintFssai" },
  pincode: { test: (v: string) => /^\d{6}$/.test(v), hint: "review.hintPincode" },
  gstin: { test: (v: string) => v.length === 15, hint: "review.hintGstin" },
} as const;

export type FormatName = keyof typeof FORMATS;

const SOURCE_LABELS: Record<string, Parameters<typeof t>[1]> = {
  ocr: "review.sourceOcr",
  llm: "review.sourceLlm",
  both: "review.sourceBoth",
};

export function FieldRow({
  label,
  field,
  lang,
  format,
  inputMode,
  onChange,
}: {
  label: string;
  field: ScanField;
  lang: Lang;
  format?: FormatName;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string | null) => void;
}) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(field.value ?? "");

  // Re-sync when the value changes underneath us - a licence being assigned to
  // this party, or a fresh scan replacing the draft.
  React.useEffect(() => {
    setDraft(field.value ?? "");
  }, [field.value]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next !== field.value) onChange(next);
  };

  const spec = format ? FORMATS[format] : undefined;
  const showHint = Boolean(spec && draft.trim() && !spec.test(draft.trim()));
  const sourceKey = field.source ? SOURCE_LABELS[field.source] : undefined;
  const flagged = field.uncertain && field.value !== null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3.5 transition-colors",
        flagged ? "border-l-4 border-l-warning border-border bg-warning-soft/30" : "border-border",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {flagged ? (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
              {t(lang, "review.pleaseCheck")}
            </span>
          ) : null}
          {sourceKey ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t(lang, sourceKey)}
            </span>
          ) : null}
        </div>
      </div>

      <Input
        id={id}
        value={draft}
        inputMode={inputMode}
        placeholder={t(lang, "review.notFound")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-describedby={showHint ? `${id}-hint` : undefined}
      />

      {showHint && spec ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-warning">
          {t(lang, spec.hint)}
        </p>
      ) : null}
    </div>
  );
}
