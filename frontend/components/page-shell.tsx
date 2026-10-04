/**
 * The frame every screen sits in: header, the max-w-6xl gutter, and a short
 * fade-up on entry.
 *
 * Motion is skipped entirely when the OS asks for reduced motion - the
 * animation is given a zero duration rather than a shorter one, so a
 * vestibular trigger is removed rather than merely softened.
 */
"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Header } from "@/components/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
  bare = false,
}: {
  children: React.ReactNode;
  /** Extra classes for the `<main>` element. */
  className?: string;
  /** Skip the shell gutter - used by the home hero, which is full-bleed. */
  bare?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <ErrorBoundary>
      <Header />
      <motion.main
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
        className={cn(bare ? undefined : "shell py-8 sm:py-12", className)}
      >
        {children}
      </motion.main>
    </ErrorBoundary>
  );
}
