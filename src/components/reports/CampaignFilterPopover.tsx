"use client";

import { useState, useEffect, useRef } from "react";

interface Campaign {
  utmCampaign: string;
  label: string;
}

export function CampaignFilterPopover({
  campaigns,
  selected,
  onChange,
}: {
  campaigns: Campaign[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  const filtered = campaigns.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const isSelected = (utm: string) => selected.includes(utm);

  const toggle = (utm: string) => {
    onChange(
      isSelected(utm) ? selected.filter((s) => s !== utm) : [...selected, utm]
    );
  };

  const buttonLabel =
    selected.length === 0
      ? "All campaigns"
      : `${selected.length} campaign${selected.length !== 1 ? "s" : ""}`;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {buttonLabel}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg w-72">
          {/* Search */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Select all / Clear all */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => onChange(campaigns.map((c) => c.utmCampaign))}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Clear all
            </button>
          </div>

          {/* Campaign list */}
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-3">
                No campaigns found
              </p>
            ) : (
              filtered.map((c) => (
                <label
                  key={c.utmCampaign}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected(c.utmCampaign)}
                    onChange={() => toggle(c.utmCampaign)}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 shrink-0"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                    {c.label}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
