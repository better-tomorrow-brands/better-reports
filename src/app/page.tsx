"use client";

import { useState } from "react";
import { OverallChart } from "@/components/reports/OverallChart";

export default function DashboardPage() {
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <div ref={setControlsEl} className="contents" />
          </div>
        </div>
      </div>
      <div className="page-content">
        <OverallChart controlsContainer={controlsEl} />
      </div>
    </div>
  );
}
