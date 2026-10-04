/**
 * App header.
 *
 * Three slots, all in one row on desktop and stacked on mobile:
 *   1. Shield-check logo + VerifyIT wordmark
 *   2. EN | हिंदी segmented toggle (pill-shaped, the chosen language is
 *      highlighted in brand teal)
 *   3. Backend status pill - "Live" or "Demo data" - wired to the data-mode
 *      hook so the user always knows what they're seeing.
 */
"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LangToggle } from "@/components/lang-toggle";
import { BackendStatusPill } from "@/components/backend-status";
import { useScan } from "@/lib/scan-store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Header({ className }: { className?: string }) {
  const { lang } = useScan();
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70",
        className,
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          aria-label={t(lang, "brand.productName")}
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-btn bg-brand text-brand-foreground shadow-sm"
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span>{t(lang, "brand.productName")}</span>
        </Link>

        <div className="flex items-center gap-2">
          <LangToggle />
          <BackendStatusPill />
        </div>
      </div>
    </header>
  );
}

export { Button };