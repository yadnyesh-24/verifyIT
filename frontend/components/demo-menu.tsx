/**
 * Floating "Demo" menu. Shown only when `?demo=1` is present or when the
 * data mode is `mock`. Lets the user pick a canned label and push it
 * straight into the store so they can demo the result flow without taking a
 * photo.
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Beaker, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScan } from "@/lib/scan-store";
import { useDataMode } from "@/lib/data-mode";
import { mockScan, mockVerify, mockKeys, type MockKey } from "@/lib/mocks";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/contract";
import { cn } from "@/lib/utils";

export function DemoMenu({ className }: { className?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { lang, setScan, setResults } = useScan();
  const mode = useDataMode();
  const visible = params.get("demo") === "1" || mode.mode === "mock";
  const [open, setOpen] = React.useState(false);

  if (!visible) return null;

  const apply = (key: MockKey) => {
    const scan = mockScan(key);
    setScan(scan);
    setResults(mockVerify(key));
    setOpen(false);
    router.push(`/results${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2",
        className,
      )}
    >
      {open ? (
        <DemoPopover lang={lang} onPick={apply} />
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="shadow-md"
      >
        <Beaker className="h-4 w-4" aria-hidden="true" />
        {t(lang, "demo.buttonLabel")}
        <ChevronUp
          className={cn(
            "h-4 w-4 transition-transform",
            open ? "rotate-180" : "",
          )}
          aria-hidden="true"
        />
      </Button>
    </div>
  );
}

function DemoPopover({
  lang,
  onPick,
}: {
  lang: Lang;
  onPick: (key: MockKey) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={t(lang, "demo.menuTitle")}
      className="w-72 rounded-card border bg-surface p-3 shadow-lg"
    >
      <h3 className="text-sm font-semibold">{t(lang, "demo.menuTitle")}</h3>
      <p className="mt-1 text-xs text-muted">{t(lang, "demo.menuHint")}</p>
      <ul className="mt-3 space-y-2">
        {mockKeys.map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(key)}
              className="w-full rounded-btn border bg-surface p-2 text-left text-sm hover:bg-muted"
            >
              <span className="block font-medium">{t(lang, `demo.${key}`)}</span>
              <span className="block text-xs text-muted">
                {t(lang, `demo.${key}Desc`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}