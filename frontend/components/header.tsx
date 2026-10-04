/**
 * Sticky header: logo, language toggle, and a pill saying whether the data on
 * screen is live or demo.
 *
 * The pill is not decoration. In `auto` mode the app silently falls back to
 * bundled fixtures when no backend answers, and a fixture that looks like a
 * real verdict is the one failure this product cannot afford - so the fallback
 * is always stated on screen.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScan } from "@/lib/scan-store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/types";

export function Header() {
  const { lang, setLang, live } = useScan();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t(lang, "app.name")}
        >
          <Logo />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <StatusPill live={live} lang={lang} />
          <ToggleGroup
            type="single"
            value={lang}
            // Radix clears the value when the active item is pressed again;
            // ignoring the empty string keeps a language always selected.
            onValueChange={(value) => {
              if (value === "en" || value === "hi") setLang(value);
            }}
            aria-label={t(lang, "app.langToggle")}
          >
            <ToggleGroupItem value="en" aria-label="English">
              EN
            </ToggleGroupItem>
            <ToggleGroupItem value="hi" aria-label="हिंदी">
              हिं
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ live, lang }: { live: boolean | null; lang: Lang }) {
  // `null` is "still probing" - render the shape so the header does not reflow
  // when the answer arrives, but say nothing yet.
  if (live === null) {
    return <span className="hidden h-8 w-20 rounded-full bg-muted sm:block" aria-hidden="true" />;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        live
          ? "border-success/25 bg-success-soft text-success"
          : "border-border bg-neutral-soft text-neutral",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full",
          live ? "bg-success" : "bg-neutral",
        )}
      />
      {live ? t(lang, "app.live") : t(lang, "app.demo")}
    </span>
  );
}
