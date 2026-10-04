/**
 * Editable party card. One party on the Review screen.
 *
 * - Title is the role in the chosen language + " · Unit X" when `unit_code` is
 *   set, also in the chosen language.
 * - Uncertain fields are highlighted amber with a "Please check" badge and a
 *   source chip (OCR / AI / Both).
 * - Each value is inline-editable: click the pencil, type, hit Save.
 * - FSSAI + pincode get a live format hint and a hard error border when the
 *   typed value does not match the regex.
 * - The role can be swapped via a dropdown that re-renders the title.
 * - The trash button removes the party (parent decides what to do next).
 */
"use client";

import * as React from "react";
import { Trash2, Pencil, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { t, tRole } from "@/lib/i18n";
import { validateField } from "@/lib/contract";
import type { Lang, Party, PartyRole, ScanField } from "@/lib/contract";

interface Props {
  party: Party;
  index: number;
  lang: Lang;
  onRoleChange: (role: PartyRole) => void;
  onFieldChange: (
    field: "unit_code" | "name" | "address" | "pincode" | "fssai" | "cin" | "gstin",
    value: string | null,
  ) => void;
  onRemove: () => void;
}

const ROLES: PartyRole[] = ["manufacturer", "marketer", "packer", "importer"];

const FIELD_KEYS = [
  "unit_code",
  "name",
  "address",
  "pincode",
  "fssai",
  "cin",
  "gstin",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_LABEL_KEYS: Record<FieldKey, string> = {
  unit_code: "Unit code",
  name: "Name",
  address: "Address",
  pincode: "Pincode",
  fssai: "FSSAI",
  cin: "CIN",
  gstin: "GSTIN",
};

/** Map a wire `source` to a translated label. */
function sourceLabel(lang: Lang, s: ScanField["source"]): string | null {
  if (s === "ocr") return t(lang, "review.source.ocr");
  if (s === "llm") return t(lang, "review.source.ai");
  if (s === "both") return t(lang, "review.source.both");
  if (s === "user") return t(lang, "common.saved");
  return null;
}

export function PartyCard({
  party,
  index,
  lang,
  onRoleChange,
  onFieldChange,
  onRemove,
}: Props) {
  const [editing, setEditing] = React.useState<FieldKey | null>(null);
  const [draft, setDraft] = React.useState<string>("");

  const startEdit = (field: FieldKey, current: string | null) => {
    setDraft(current ?? "");
    setEditing(field);
  };
  const commit = () => {
    if (!editing) return;
    onFieldChange(editing, draft.trim().length > 0 ? draft.trim() : null);
    setEditing(null);
  };

  const unit = party.unit_code.value;
  const unitSuffix = unit ? `${t(lang, "review.unitSuffix")} ${unit}` : null;

  return (
    <article
      aria-labelledby={`party-${party.id}-title`}
      className="rounded-card border bg-surface p-4 shadow-sm sm:p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h3
            id={`party-${party.id}-title`}
            className="text-base font-semibold leading-tight sm:text-lg"
          >
            {tRole(lang, party.role)}
            {unitSuffix ? (
              <span className="text-muted"> · {unitSuffix}</span>
            ) : null}
          </h3>
          <label className="block text-xs text-muted">
            {t(lang, "review.unitSuffix")}
            <div className="relative mt-1">
              <select
                value={party.role}
                onChange={(e) => onRoleChange(e.target.value as PartyRole)}
                aria-label={tRole(lang, party.role)}
                className="control-min w-full appearance-none rounded-btn border bg-surface pl-3 pr-9 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tRole(lang, r)}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
            </div>
          </label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(lang, "review.removeParty")}
          onClick={onRemove}
          className="text-muted hover:text-risk"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELD_KEYS.map((field) => (
          <FieldRow
            key={field}
            field={field}
            lang={lang}
            scanField={party[field]}
            editing={editing === field}
            draft={draft}
            setDraft={setDraft}
            startEdit={startEdit}
            commit={commit}
          />
        ))}
      </dl>

      <p className="sr-only">
        Party {index + 1}: {tRole(lang, party.role)}
      </p>
    </article>
  );
}

interface FieldRowProps {
  field: FieldKey;
  lang: Lang;
  scanField: ScanField;
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  startEdit: (field: FieldKey, current: string | null) => void;
  commit: () => void;
}

function FieldRow({
  field,
  lang,
  scanField,
  editing,
  draft,
  setDraft,
  startEdit,
  commit,
}: FieldRowProps) {
  const label = t(lang, `review.${FIELD_LABEL_KEYS[field]}`);
  const display = scanField.value ?? t(lang, "review.notFound");
  const sourceText = sourceLabel(lang, scanField.source);
  const showFormatError =
    (field === "fssai" || field === "pincode") &&
    scanField.source === "user" &&
    !validateField(field, scanField.value);
  const formatHintKey =
    field === "fssai"
      ? "review.validation.fssaiHint"
      : "review.validation.pincodeHint";
  const formatErrKey =
    field === "fssai"
      ? "review.validation.fssaiInvalid"
      : "review.validation.pincodeInvalid";

  return (
    <div
      className={cn(
        "rounded-btn border bg-surface p-3",
        scanField.uncertain && !scanField.value && "border-warn/50 bg-warn/5",
        scanField.uncertain && !!scanField.value && "border-warn/60 bg-warn/10",
        showFormatError && "border-risk/60 bg-risk/5",
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
          {scanField.uncertain && scanField.value !== null ? (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warn">
              {t(lang, "review.pleaseCheck")}
            </span>
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={() => startEdit(field, scanField.value)}
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
        {editing ? (
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
        ) : scanField.value ? (
          <span className="font-medium text-ink">{display}</span>
        ) : (
          <span className="text-muted">{display}</span>
        )}
      </dd>
      {(field === "fssai" || field === "pincode") && !editing ? (
        <p
          className={cn(
            "mt-1 text-xs",
            showFormatError ? "text-risk" : "text-subtle",
          )}
        >
          {showFormatError ? t(lang, formatErrKey) : t(lang, formatHintKey)}
        </p>
      ) : null}
    </div>
  );
}