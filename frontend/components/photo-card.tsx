/**
 * Zoomable photo preview. On mobile the photo stacks above the fields; on
 * desktop it sits in a sticky column next to the editor.
 */
"use client";

import { useState } from "react";
import Image from "next/image";
import { Expand, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/contract";
import { t } from "@/lib/i18n";

export function PhotoCard({
  src,
  alt,
  lang,
  className,
}: {
  src: string | null;
  alt: string;
  lang: Lang;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-card border bg-surface shadow-sm",
          className,
        )}
      >
        {src ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative block w-full"
            aria-label={t(lang, "review.photoZoomHint")}
          >
            <Image
              src={src}
              alt={alt}
              width={800}
              height={600}
              unoptimized
              className="h-auto w-full object-contain"
            />
            <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-1 text-xs font-medium text-muted shadow-sm">
              <Expand className="h-3.5 w-3.5" aria-hidden="true" />
              {t(lang, "review.photoZoomHint")}
            </span>
          </button>
        ) : (
          <div className="grid h-40 place-items-center text-sm text-muted">
            {t(lang, "hero.photoAlt")}
          </div>
        )}
      </div>

      {open && src ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4"
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute right-4 top-4 text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
          <Image
            src={src}
            alt={alt}
            width={1600}
            height={1200}
            unoptimized
            className="max-h-[85vh] w-auto max-w-full rounded-card object-contain shadow-lg"
          />
        </div>
      ) : null}
    </>
  );
}