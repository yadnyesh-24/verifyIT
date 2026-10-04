/**
 * Tiny shadcn-style class merge helper. Keeps `clsx` + `tailwind-merge` semantics
 * in one place so components can write `cn(...)` everywhere.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}