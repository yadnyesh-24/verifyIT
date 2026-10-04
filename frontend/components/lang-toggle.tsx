/**
 * EN | हिंदी segmented toggle. Renders both languages as buttons so the user
 * can see at a glance which one is active. Pressing the inactive option
 * flips the language stored in `useScan()`, which every component reads via
 * `useScan().lang`.
 */
"use client";

import { useScan } from "@/lib/scan-store";

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useScan();
  return (
    <div
      role="group"
      aria-label="Language"
      className={
        "inline-flex items-center rounded-full border bg-surface p-0.5 text-sm font-medium shadow-sm " +
        (className ?? "")
      }
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={
          "control-min rounded-full px-3 text-sm transition-colors " +
          (lang === "en"
            ? "bg-brand text-brand-foreground"
            : "text-muted hover:text-ink")
        }
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("hi")}
        aria-pressed={lang === "hi"}
        className={
          "control-min rounded-full px-3 text-sm transition-colors " +
          (lang === "hi"
            ? "bg-brand text-brand-foreground"
            : "text-muted hover:text-ink")
        }
      >
        हिंदी
      </button>
    </div>
  );
}