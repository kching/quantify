"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface SelectControlProps {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  placeholder?: string;
  displayValue?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SelectControl({
  value,
  onValueChange,
  ariaLabel,
  id,
  placeholder,
  displayValue,
  className,
  children,
}: SelectControlProps) {
  const selectedOption = Children.toArray(children).find(
    (child) =>
      isValidElement(child) &&
      (child as ReactElement<{ value?: string }>).props.value === value,
  );
  const selectedLabel =
    displayValue ??
    (isValidElement(selectedOption)
      ? (selectedOption as ReactElement<{ children?: ReactNode }>).props
          .children
      : undefined);
  return (
    <Select.Root
      value={value}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") onValueChange(nextValue);
      }}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:ring-2 data-[popup-open]:ring-ring",
          className,
        )}
      >
        <Select.Value placeholder={placeholder}>{selectedLabel}</Select.Value>
        <Select.Icon>
          <ChevronDown className="size-4 opacity-60" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          side="bottom"
          align="start"
          alignItemWithTrigger={false}
          sideOffset={5}
          className="z-50 outline-none"
        >
          <Select.Popup className="w-[var(--anchor-width)] max-h-[var(--available-height)] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <Select.ScrollUpArrow className="flex justify-center py-1">
              <ChevronUp className="size-3" />
            </Select.ScrollUpArrow>
            <Select.List>{children}</Select.List>
            <Select.ScrollDownArrow className="flex justify-center py-1">
              <ChevronDown className="size-3" />
            </Select.ScrollDownArrow>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function SelectOption({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <Select.Item
      value={value}
      className="relative flex min-h-8 cursor-default select-none items-center rounded-sm py-1 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <Select.ItemIndicator className="absolute left-2 inline-flex size-4 items-center justify-center">
        <Check className="size-4" />
      </Select.ItemIndicator>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}
