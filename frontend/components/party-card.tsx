/**
 * Editable party card. Shows one party on the Review screen.
 *
 * - Title is the role in the chosen language; " - Unit X" is appended when the
 *   `unit_code` is set, also in the chosen language.
 * - Uncertain fields are highlighted amber with a "Please check" badge.
 * - Each value is inline-editable: click "Edit", type, hit Save.
 * - The role can be swapped via a dropdown that always re-renders the title.
 * - The remove button hides the whole card; the parent decides how to react.
 */
"use client";

import * as React from "react";
import { Trash2, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { t, tRole } from "@/lib/i18n";
import type { Lang, Party, PartyRole } from "@/lib/types";

interface Props {
  party: Party;
  index: number;
  lang: Lang;
  onRoleChange: (role: PartyRole) => void;
  onFieldChange: (
    field: keyof Omit<Party, "id" | "role">,
    value: string | null,
  ) => void;
  onRemove: () => void;
}

const ROLES: PartyRole[] = ["manufacturer", "marketer", "packer", "importer"];

export const FIELD_LABELS: Record<
  keyof Omit<Party, "id" | "role">,
  { en: string; hi: string }
> = {
  unit_code: { en: "Unit code", hi: "यूनिट कोड" },
  name: { en: "Name", hi: "नाम" },
  address: { en: "Address", hi: "पता" },
  pincode: { en: "Pincode", hi: "पिनकोड" },
  fssai: { en: "FSSAI", hi: "FSSAI" },
  cin: { en: "CIN", hi: "CIN" },
  gstin: { en: "GSTIN", hi: "GSTIN" },
};

export const FIELD_ORDER: (keyof Omit<Party, "id" | "role">)[] = [
  "unit_code",
  "name",
  "address",
  "pincode",
  "fssai",
  "cin",
  "gstin",
];

export function PartyCard({
  party,
  index,
  lang,
  onRoleChange,
  onFieldChange,
  onRemove,
}: Props) {
  const [editing, setEditing] = React.useState<
    keyof Omit<Party, "id" | "role"> | null
  >(null);
  const [draft, setDraft] = React.useState<string>("");

  const startEdit = (
    field: keyof Omit<Party, "id" | "role">,
    current: string | null,
  ) => {
    setDraft(current ?? "");
    setEditing(field);
  };

  const commit = () => {
    if (!editing) return;
    onFieldChange(editing, draft.trim().length > 0 ? draft.trim() : null);
    setEditing(null);
  };

  const unit = party.unit_code.value;
  return (
    <article
      aria-labelledby={`party-${party.id}-title`}
      className="rounded-lg border bg-card p-4 sm:p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3
            id={`party-${party.id}-title`}
            className="flex flex-wrap items-baseline gap-2 text-base font-semibold sm:text-lg"
          >
            <span>{tRole(lang, party.role)}</span>
            {unit ? (
              <span className="text-sm font-normal text-muted-foreground">
                {lang === "hi" ? " - " : " - "}
                {t(lang, "review.unitSuffix")} {unit}
              </span>
            ) : null}
          </h3>
          <label className="block text-xs text-muted-foreground">
            {t(lang, "review.changeRolePrompt")}
            <Select
              className="mt-1 h-9 max-w-xs"
              value={party.role}
              onChange={(e) => onRoleChange(e.target.value as PartyRole)}
              aria-label={t(lang, "review.changeRolePrompt")}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tRole(lang, r)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(lang, "review.removeParty")}
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELD_ORDER.map((field) => {
          const scanField = party[field];
          const label = FIELD_LABELS[field][lang];
          const isEditing = editing === field;
          const display = scanField.value ?? t(lang, "review.notFound");
          return (
            <div
              key={field}
              className={cn(
                "rounded-md border bg-background p-3",
                scanField.uncertain && "border-warning/60 bg-warning/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <div className="flex items-center gap-2">
                  {scanField.uncertain && scanField.value !== null ? (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warning">
                      {t(lang, "review.pleaseCheck")}
                    </span>
                  ) : null}
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => startEdit(field, scanField.value)}
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
                ) : scanField.value ? (
                  <span className="font-medium text-foreground">{display}</span>
                ) : (
                  <span className="text-muted-foreground">{display}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="sr-only">
        Party {index + 1}: {tRole(lang, party.role)}
      </p>
    </article>
  );
}