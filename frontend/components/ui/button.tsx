/**
 * Button. Polymorphic via `asChild` using Radix's `Slot`.
 *
 * Every size is at least 44px tall, and the two used for primary actions are
 * 48px and 56px: these are thumb targets on a phone held one-handed in a shop
 * aisle, which is where this app is actually used.
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover hover:shadow-card-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-border",
        soft: "bg-primary-soft text-primary-hover hover:bg-primary-soft/70",
        ghost: "text-foreground hover:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-card text-foreground shadow-card hover:border-primary/40 hover:bg-primary-soft/30",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      size: {
        sm: "h-11 px-4 text-sm",
        md: "h-12 px-5 text-base",
        lg: "h-12 px-6 text-base sm:h-13 sm:px-7",
        xl: "h-14 px-8 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
