import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "./utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // 🎨 MINIMAL PROFESSIONAL DESIGN PHILOSOPHY
        // Clean borders, simple squares, no fancy effects
        "peer size-4 shrink-0 rounded border-2 border-slate-300 bg-white",
        "transition-colors duration-150",
        // Checked state - simple fill
        "data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900",
        // Focus state - subtle ring
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
        // Hover state - slightly darker border
        "hover:border-slate-400",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-white"
      >
        <CheckIcon className="size-3 stroke-[3]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };