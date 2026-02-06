"use client";

import * as React from "react";
import { format, subDays, startOfDay, endOfDay, startOfYesterday, endOfYesterday } from "date-fns";
import { DayPicker, DateRange } from "react-day-picker";

// Preset options
const presets = [
  { label: "Today", getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: "Yesterday", getValue: () => ({ from: startOfYesterday(), to: endOfYesterday() }) },
  { label: "Last 7 days", getValue: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { label: "Last 30 days", getValue: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
  { label: "Last 90 days", getValue: () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }) },
];

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  placeholder?: string;
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  placeholder = "Select dates",
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [leftMonth, setLeftMonth] = React.useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  });
  const [rightMonth, setRightMonth] = React.useState<Date>(() => new Date());
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDateRange = () => {
    if (!dateRange?.from) return placeholder;
    if (!dateRange.to) return format(dateRange.from, "dd MMM yyyy");
    return `${format(dateRange.from, "dd MMM yyyy")} - ${format(dateRange.to, "dd MMM yyyy")}`;
  };

  const handlePresetClick = (preset: typeof presets[0]) => {
    const range = preset.getValue();
    onDateRangeChange(range);
    setSelectedPreset(preset.label);
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    onDateRangeChange(range);
    setSelectedPreset(null); // Clear preset when manually selecting
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateRangeChange(undefined);
    setSelectedPreset(null);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleApply = () => {
    setIsOpen(false);
  };

  // Navigate left calendar back one month
  const goToPrevMonth = () => {
    setLeftMonth(new Date(leftMonth.getFullYear(), leftMonth.getMonth() - 1, 1));
    setRightMonth(new Date(rightMonth.getFullYear(), rightMonth.getMonth() - 1, 1));
  };

  // Navigate right calendar forward one month
  const goToNextMonth = () => {
    setLeftMonth(new Date(leftMonth.getFullYear(), leftMonth.getMonth() + 1, 1));
    setRightMonth(new Date(rightMonth.getFullYear(), rightMonth.getMonth() + 1, 1));
  };

  return (
    <div className="date-range-picker" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-secondary btn-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {formatDateRange()}
        {dateRange?.from && (
          <button
            type="button"
            onClick={handleClear}
            className="btn-icon-clear"
            aria-label="Clear dates"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </button>

      {isOpen && (
        <div className="date-range-popover">
          {/* Left: Presets */}
          <div className="date-range-presets">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`date-range-preset ${selectedPreset === preset.label ? "date-range-preset-active" : ""}`}
                onClick={() => handlePresetClick(preset)}
              >
                {preset.label}
                {selectedPreset === preset.label && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Right: Calendars */}
          <div className="date-range-calendars-section">
            {/* Date inputs */}
            <div className="date-range-inputs">
              <div className="date-range-input">
                {dateRange?.from ? format(dateRange.from, "MMMM d, yyyy") : "Start date"}
              </div>
              <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div className="date-range-input">
                {dateRange?.to ? format(dateRange.to, "MMMM d, yyyy") : "End date"}
              </div>
            </div>

            {/* Dual calendars */}
            <div className="date-range-calendars">
              {/* Left Calendar */}
              <div className="date-range-calendar">
                <div className="date-range-calendar-header">
                  <button
                    type="button"
                    className="date-range-nav-btn"
                    onClick={goToPrevMonth}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <span className="date-range-calendar-title">
                    {format(leftMonth, "MMMM yyyy")}
                  </span>
                </div>
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={handleCalendarSelect}
                  month={leftMonth}
                  onMonthChange={setLeftMonth}
                  showOutsideDays
                  hideNavigation
                  classNames={{
                    root: "rdp-root",
                    month: "rdp-month",
                    weekdays: "rdp-weekdays",
                    weekday: "rdp-weekday",
                    week: "rdp-week",
                    day: "rdp-day",
                    day_button: "rdp-day-button",
                    selected: "rdp-selected",
                    range_start: "rdp-range-start",
                    range_middle: "rdp-range-middle",
                    range_end: "rdp-range-end",
                    today: "rdp-today",
                    outside: "rdp-outside",
                    disabled: "rdp-disabled",
                  }}
                  components={{
                    MonthCaption: () => <></>,
                  }}
                />
              </div>

              {/* Right Calendar */}
              <div className="date-range-calendar">
                <div className="date-range-calendar-header">
                  <span className="date-range-calendar-title">
                    {format(rightMonth, "MMMM yyyy")}
                  </span>
                  <button
                    type="button"
                    className="date-range-nav-btn"
                    onClick={goToNextMonth}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={handleCalendarSelect}
                  month={rightMonth}
                  onMonthChange={setRightMonth}
                  showOutsideDays
                  hideNavigation
                  classNames={{
                    root: "rdp-root",
                    month: "rdp-month",
                    weekdays: "rdp-weekdays",
                    weekday: "rdp-weekday",
                    week: "rdp-week",
                    day: "rdp-day",
                    day_button: "rdp-day-button",
                    selected: "rdp-selected",
                    range_start: "rdp-range-start",
                    range_middle: "rdp-range-middle",
                    range_end: "rdp-range-end",
                    today: "rdp-today",
                    outside: "rdp-outside",
                    disabled: "rdp-disabled",
                  }}
                  components={{
                    MonthCaption: () => <></>,
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="date-range-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleApply}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
