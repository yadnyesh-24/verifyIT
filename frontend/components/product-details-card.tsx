/**
 * Product-level fields: the things printed about the pack itself rather than
 * about any company on it.
 */
"use client";

import { Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow } from "@/components/field-row";
import { t } from "@/lib/i18n";
import { PRODUCT_FIELDS } from "@/lib/types";
import type { Lang, ProductFieldKey, ProductFields } from "@/lib/types";

const LABELS: Record<ProductFieldKey, Record<Lang, string>> = {
  product_name: { en: "Product name", hi: "उत्पाद का नाम" },
  mrp: { en: "MRP", hi: "अधिकतम खुदरा मूल्य" },
  net_qty: { en: "Net quantity", hi: "कुल मात्रा" },
  mfg_date: { en: "Manufactured / packed on", hi: "निर्माण / पैकिंग तिथि" },
  expiry: { en: "Expiry / best before", hi: "समाप्ति / बेस्ट बिफ़ोर" },
  customer_care: { en: "Customer care", hi: "ग्राहक सेवा" },
  bis_licence: { en: "BIS / ISI licence", hi: "BIS / ISI लाइसेंस" },
};

export function ProductDetailsCard({
  product,
  lang,
  onChange,
}: {
  product: ProductFields;
  lang: Lang;
  onChange: (key: ProductFieldKey, value: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Package className="h-5 w-5" aria-hidden="true" />
        </span>
        <CardTitle>{t(lang, "review.productDetails")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRODUCT_FIELDS.map((key) => (
          <FieldRow
            key={key}
            label={LABELS[key][lang]}
            field={product[key]}
            lang={lang}
            onChange={(value) => onChange(key, value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
