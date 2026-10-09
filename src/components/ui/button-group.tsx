import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ButtonGroup({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      role="group"
      className={cn("inline-flex items-center", className)}
      {...props}
    />
  );
}
