/**
 * App header. Logo + product name + EN/HI toggle.
 *
 * The toggle lives in the header so it is reachable from anywhere in the app.
 * Pressing it flips the language stored in `useScan()`, which every component
 * reads via `useScan().lang`.
 */
"use client";

import Link from "next/link";
import { useScan } from "@/lib/scan-store";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Header({ className }: { className?: string }) {
  const { lang, setLang } = useScan();
  const other = lang === "en" ? "hi" : "en";
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-background/85 backdrop-blur",
        className,
      )}
    >
      <div className="container flex h-14 items-center justify-between">
        <Link
          href="/"
          aria-label={t(lang, "app.productName")}
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"
          >
            ✓
          </span>
          <span>{t(lang, "app.productName")}</span>
        </Link>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLang(other)}
          aria-label="Toggle language"
          className="font-medium"
        >
          {t(lang, "common.languageToggle")}
        </Button>
      </div>
    </header>
  );
}