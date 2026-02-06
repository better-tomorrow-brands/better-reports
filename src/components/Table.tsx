"use client";

import React from "react";

interface Column<T> {
  key: keyof T | string;
  label: string;
  sticky?: boolean;
  primary?: boolean;
  className?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: keyof T | ((row: T) => string | number);
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  emptyMessage = "No data",
  onRowClick,
}: TableProps<T>) {
  const getRowKey = (row: T, index: number): string | number => {
    if (typeof rowKey === "function") {
      return rowKey(row);
    }
    const record = row as Record<string, unknown>;
    return (record[rowKey as string] as string | number) ?? index;
  };

  const getValue = (row: T, key: string): unknown => {
    const record = row as Record<string, unknown>;
    return key.includes(".")
      ? key.split(".").reduce((obj, k) => (obj as Record<string, unknown>)?.[k], row as unknown)
      : record[key];
  };

  if (data.length === 0) {
    return <div className="table-empty">{emptyMessage}</div>;
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr className="table-header-row">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`table-header-cell ${col.sticky ? "table-header-cell-sticky" : ""} ${col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={getRowKey(row, rowIdx)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`table-body-row ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((col) => {
                const value = getValue(row, String(col.key));
                const rendered = col.render ? col.render(value, row) : (value ?? "-");
                return (
                  <td
                    key={String(col.key)}
                    className={`table-cell ${col.sticky ? "table-cell-sticky" : ""} ${col.primary ? "table-cell-primary" : ""} ${col.className || ""}`}
                    title={typeof value === "string" ? value : undefined}
                  >
                    {rendered as React.ReactNode}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Re-export types for convenience
export type { Column, TableProps };
