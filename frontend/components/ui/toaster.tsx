/**
 * Toaster wrapper around `sonner`. Imported once from `app/layout.tsx` so any
 * screen can call `toast.success(...)`.
 */
"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-md text-sm",
        },
      }}
    />
  );
}