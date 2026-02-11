import { NextResponse } from "next/server";
import { upsertPosthogAnalytics } from "@/lib/posthog";
import type { DailyAnalytics } from "@/lib/posthog";

export const maxDuration = 300;

export async function POST(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadUrl = new URL(request.url);
  const orgIdParam = uploadUrl.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // Parse header
    const headers = lines[0].split(",").map((h) => h.trim());
    const dateIdx = headers.indexOf("date");
    if (dateIdx === -1) {
      return NextResponse.json(
        { error: 'CSV must have a "date" column' },
        { status: 400 }
      );
    }

    // Column mapping: CSV header → DailyAnalytics key
    const columnMap: Record<string, keyof DailyAnalytics> = {
      date: "date",
      unique_visitors: "unique_visitors",
      total_sessions: "total_sessions",
      pageviews: "pageviews",
      bounce_rate: "bounce_rate",
      avg_session_duration: "avg_session_duration",
      mobile_sessions: "mobile_sessions",
      desktop_sessions: "desktop_sessions",
      top_country: "top_country",
      direct_sessions: "direct_sessions",
      organic_sessions: "organic_sessions",
      paid_sessions: "paid_sessions",
      social_sessions: "social_sessions",
      product_views: "product_views",
      add_to_cart: "add_to_cart",
      checkout_started: "checkout_started",
      purchases: "purchases",
      conversion_rate: "conversion_rate",
    };

    let inserted = 0;
    let errors = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = line.split(",").map((v) => v.trim());

        const analytics: DailyAnalytics = {
          date: "",
          unique_visitors: 0,
          total_sessions: 0,
          pageviews: 0,
          bounce_rate: 0,
          avg_session_duration: 0,
          mobile_sessions: 0,
          desktop_sessions: 0,
          top_country: "",
          direct_sessions: 0,
          organic_sessions: 0,
          paid_sessions: 0,
          social_sessions: 0,
          product_views: 0,
          add_to_cart: 0,
          checkout_started: 0,
          purchases: 0,
          conversion_rate: 0,
        };

        for (let j = 0; j < headers.length; j++) {
          const key = columnMap[headers[j]];
          if (!key || j >= values.length) continue;

          if (key === "date" || key === "top_country") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (analytics as any)[key] = values[j];
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (analytics as any)[key] = Number(values[j]) || 0;
          }
        }

        if (!analytics.date) {
          throw new Error("Missing date value");
        }

        await upsertPosthogAnalytics(analytics, orgId);
        inserted++;
      } catch (error) {
        errors++;
        errorDetails.push({
          row: i + 1,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: lines.length - 1,
      inserted,
      errors,
      ...(errorDetails.length > 0 && { errorDetails }),
    });
  } catch (error) {
    console.error("PostHog CSV upload error:", error);
    return NextResponse.json(
      {
        error: "Failed to process CSV",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
