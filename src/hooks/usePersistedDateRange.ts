import { useState, useEffect } from "react";
import { DateRange } from "react-day-picker";

function serialize(range: DateRange | undefined): string {
  if (!range) return "";
  return JSON.stringify({
    from: range.from?.toISOString(),
    to: range.to?.toISOString(),
  });
}

function deserialize(raw: string): DateRange | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return {
      from: parsed.from ? new Date(parsed.from) : undefined,
      to: parsed.to ? new Date(parsed.to) : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Drop-in replacement for `useState<DateRange | undefined>` that persists
 * the selected range in sessionStorage so it survives page navigation.
 *
 * Always initialises with `getDefault()` so SSR and the first client render
 * produce identical HTML (no hydration mismatch). After mount, the stored
 * value is read from sessionStorage and applied if present.
 *
 * @param key        Unique sessionStorage key for this component.
 * @param getDefault Factory function that returns the fallback DateRange.
 */
export function usePersistedDateRange(
  key: string,
  getDefault: () => DateRange | undefined
): [DateRange | undefined, (range: DateRange | undefined) => void] {
  // Always start with the default so the server and first client render match.
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(getDefault);

  // After mount, hydrate from sessionStorage if a value was previously stored.
  useEffect(() => {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const deserialized = deserialize(stored);
      if (deserialized) {
        setDateRangeState(deserialized);
      }
    }
    // Only run on mount — key changes should not re-hydrate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrap the setter so writes to sessionStorage happen at the same time as
  // state updates (avoids a stale-effect writing an outdated value).
  function setDateRange(range: DateRange | undefined) {
    setDateRangeState(range);
    if (range === undefined) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, serialize(range));
    }
  }

  return [dateRange, setDateRange];
}
