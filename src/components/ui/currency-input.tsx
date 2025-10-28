"use client";

import * as React from "react";

import { caretIndexFromDigits, countDigitsUntil, digitsFromCurrencyInput, formatCurrencyFromDigits } from "@/lib/format";

import { Input, type InputProps } from "./input";

type CurrencyInputProps = Omit<InputProps, "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "pattern"> & {
  value: string;
  onValueChange: (nextDigits: string) => void;
};

function assignRefs<T>(node: T, ...refs: Array<React.Ref<T>>) {
  refs.forEach((ref) => {
    if (!ref) return;
    if (typeof ref === "function") {
      ref(node);
    } else {
      try {
        // @ts-expect-error - readonly
        ref.current = node;
      } catch {
        // ignore
      }
    }
  });
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const caretDigitsRef = React.useRef<number>(digitsFromCurrencyInput(value).length);

    const formattedValue = React.useMemo(() => formatCurrencyFromDigits(value), [value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      const digitsBeforeCaret = countDigitsUntil(nextValue, event.target.selectionStart ?? nextValue.length);
      caretDigitsRef.current = digitsBeforeCaret;
      onValueChange(digitsFromCurrencyInput(nextValue));
    };

    React.useLayoutEffect(() => {
      const input = internalRef.current;
      if (!input) {
        return;
      }
      const maxDigits = digitsFromCurrencyInput(formattedValue).length;
      const caretDigits = Math.min(caretDigitsRef.current, maxDigits);
      const nextCaret = caretIndexFromDigits(formattedValue, caretDigits);
      window.requestAnimationFrame(() => {
        input.setSelectionRange(nextCaret, nextCaret);
      });
    }, [formattedValue]);

    return (
      <Input
        {...props}
        ref={(node) => assignRefs(node, internalRef, forwardedRef)}
        type="text"
        inputMode="numeric"
        value={formattedValue}
        onChange={handleChange}
      />
    );
  },
);

CurrencyInput.displayName = "CurrencyInput";
