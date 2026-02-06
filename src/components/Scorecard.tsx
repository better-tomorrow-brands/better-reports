"use client";

interface ScorecardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: "success" | "error" | "default";
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
}

export function Scorecard({ title, value, subtitle, subtitleColor, trend, icon }: ScorecardProps) {
  return (
    <div className="scorecard">
      <div className="scorecard-header">
        <span className="scorecard-title">{title}</span>
        {icon && <span className="scorecard-icon">{icon}</span>}
      </div>
      <div className="scorecard-value">{value}</div>
      {(subtitle || trend) && (
        <div className="scorecard-footer">
          {trend && (
            <span className={`scorecard-trend ${trend.isPositive ? "scorecard-trend-positive" : "scorecard-trend-negative"}`}>
              <img
                src="/icons/up-arrow.png"
                alt={trend.isPositive ? "up" : "down"}
                className={`scorecard-trend-icon${trend.isPositive ? "" : " scorecard-trend-icon-down"}`}
              />
              {Math.abs(trend.value)}%
            </span>
          )}
          {subtitle && <span className={`scorecard-subtitle${subtitleColor === "success" ? " scorecard-subtitle-success" : subtitleColor === "error" ? " scorecard-subtitle-error" : ""}`}>{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

interface ScorecardGridProps {
  children: React.ReactNode;
  scrollable?: boolean;
}

export function ScorecardGrid({ children, scrollable = false }: ScorecardGridProps) {
  return (
    <div className={scrollable ? "scorecard-scroll-container" : "scorecard-grid"}>
      {scrollable ? <div className="scorecard-scroll-inner">{children}</div> : children}
    </div>
  );
}
