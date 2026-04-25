import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,#2563eb_0%,#4f46e5_45%,#7c3aed_100%)] text-primary-foreground shadow-[0_20px_50px_-20px_rgba(79,70,229,0.75)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-24px_rgba(79,70,229,0.85)]",
        secondary:
          "border border-white/70 bg-white/75 text-slate-900 shadow-[0_12px_32px_-18px_rgba(15,23,42,0.28)] backdrop-blur hover:bg-white/90",
        outline:
          "border border-slate-200/80 bg-white/55 text-slate-800 backdrop-blur hover:bg-white/80 hover:text-slate-950",
        ghost: "text-slate-700 hover:bg-white/60 hover:text-slate-950",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_18px_40px_-24px_rgba(244,63,94,0.85)] hover:bg-destructive/90",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 rounded-xl px-3.5",
        lg: "h-12 rounded-[20px] px-8 text-base",
        icon: "h-10 w-10 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
