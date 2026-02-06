"use client";

import React from "react";

interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  onClick,
  className = "",
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={`checkbox ${className}`}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(e) => onChange?.(e.target.checked)}
      onClick={onClick}
    />
  );
}
