/**
 * One company named on the pack.
 *
 * A pack routinely names several - a marketer in one city and two
 * manufacturing units in others - and each carries its own address and
 * licence. Keeping them as separate cards is what lets the user say which
 * licence belongs to whom instead of the app guessing.
 */
"use client";

import { Building2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { FieldRow, type FormatName } from "@/components/field-row";
import { t, tRole } from "@/lib/i18n";
import { PARTY_ROLES } from "@/lib/types";
import type { Lang, Party, PartyFieldKey, PartyRole } from "@/lib/types";

const LABELS: Record<PartyFieldKey, Record<Lang, string>> = {
  unit_code: { en: "Unit code", hi: "यूनिट कोड" },
  name: { en: "Company name", hi: "कंपनी का नाम" },
  address: { en: "Address", hi: "पता" },
  pincode: { en: "Pincode", hi: "पिनकोड" },
  fssai: { en: "FSSAI licence", hi: "FSSAI लाइसेंस" },
  cin: { en: "CIN", hi: "CIN" },
  gstin: { en: "GSTIN", hi: "GSTIN" },
};

const ORDER: PartyFieldKey[] = [
  "name",
  "unit_code",
  "address",
  "pincode",
  "fssai",
  "cin",
  "gstin",
];

const FORMATS: Partial<Record<PartyFieldKey, FormatName>> = {
  fssai: "fssai",
  pincode: "pincode",
  gstin: "gstin",
};

const NUMERIC: PartyFieldKey[] = ["pincode", "fssai"];

export function PartyCard({
  party,
  lang,
  canRemove,
  onRoleChange,
  onFieldChange,
  onRemove,
}: {
  party: Party;
  lang: Lang;
  canRemove: boolean;
  onRoleChange: (role: PartyRole) => void;
  onFieldChange: (key: PartyFieldKey, value: string | null) => void;
  onRemove: () => void;
}) {
  const unit = party.unit_code.value;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-2">
            <h3 className="text-lg font-bold leading-snug tracking-tight">
              {tRole(lang, party.role)}
              {unit ? (
                <span className="font-medium text-muted-foreground">
                  {" · "}
                  {t(lang, "review.unitSuffix")} {unit}
                </span>
              ) : null}
            </h3>
            <label className="block text-xs font-medium text-muted-foreground">
              {t(lang, "review.changeRole")}
              <Select
                className="mt-1 h-11 max-w-[14rem] text-sm"
                value={party.role}
                onChange={(e) => onRoleChange(e.target.value as PartyRole)}
                aria-label={t(lang, "review.changeRole")}
              >
                {PARTY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {tRole(lang, role)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>

        {canRemove ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(lang, "review.removeParty")}
            onClick={onRemove}
            className="shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ORDER.map((key) => (
          <FieldRow
            key={key}
            label={LABELS[key][lang]}
            field={party[key]}
            lang={lang}
            format={FORMATS[key]}
            inputMode={NUMERIC.includes(key) ? "numeric" : undefined}
            onChange={(value) => onFieldChange(key, value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
