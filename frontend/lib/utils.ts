/**
 * Class-name helper: `clsx` for conditionals, `tailwind-merge` so a later
 * utility wins over an earlier conflicting one.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
