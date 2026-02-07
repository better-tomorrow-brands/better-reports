"use client";

import { useState, useEffect, useRef } from "react";

export interface SeriesConfig {
  key: string;
  label: string;
  color: string;
  visible: boolean;
  type: "bar" | "line";
  yAxisId: "left" | "right";
  showDots: boolean;
}

export function ChartSettingsPopover({
  series,
  onChange,
}: {
  series: SeriesConfig[];
  onChange: (updated: SeriesConfig[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateSeries = (key: string, patch: Partial<SeriesConfig>) => {
    onChange(series.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
        aria-label="Chart settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 w-64">
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Chart Series</p>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Show Points</p>
          </div>
          <div className="flex flex-col gap-2">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.visible}
                  onChange={(e) => updateSeries(s.key, { visible: e.target.checked })}
                  className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 shrink-0"
                />
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => updateSeries(s.key, { color: e.target.value })}
                  className="w-5 h-5 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer p-0 shrink-0"
                  style={{ appearance: "none", background: s.color }}
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{s.label}</span>
                {s.type === "line" ? (
                  <button
                    onClick={() => updateSeries(s.key, { showDots: !s.showDots })}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      s.showDots ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                    role="switch"
                    aria-checked={s.showDots}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
                        s.showDots ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </button>
                ) : (
                  <span className="w-7 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
