"use client";

import { Card } from "@tremor/react";

interface ScorecardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
}

export function Scorecard({ title, value, subtitle, trend, icon }: ScorecardProps) {
  return (
    <Card className="scorecard">
      <div className="scorecard-header">
        <span className="scorecard-title">{title}</span>
        {icon && <span className="scorecard-icon">{icon}</span>}
      </div>
      <div className="scorecard-value">{value}</div>
      {(subtitle || trend) && (
        <div className="scorecard-footer">
          {trend && (
            <span className={`scorecard-trend ${trend.isPositive ? "scorecard-trend-positive" : "scorecard-trend-negative"}`}>
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
          {subtitle && <span className="scorecard-subtitle">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
}

interface ScorecardGridProps {
  children: React.ReactNode;
}

export function ScorecardGrid({ children }: ScorecardGridProps) {
  return <div className="scorecard-grid">{children}</div>;
}
