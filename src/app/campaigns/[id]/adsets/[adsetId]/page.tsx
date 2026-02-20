"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets } from "@/components/DateRangePicker";
import PageLayout from "@/components/PageLayout";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdCreativeRow {
  adId: string;
  ad: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  shopClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerResult: number;
  costPerLandingPageView: number;
}

interface DayRow {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerResult: number;
  roas: number;
}

// ─── Metric columns config ────────────────────────────────────────────────────

const METRIC_COLS: { key: keyof AdCreativeRow; label: string; fmt: (v: number) => string }[] = [
  { key: "purchases",              label: "Results",        fmt: (v) => v.toLocaleString() },
  { key: "reach",                  label: "Reach",          fmt: (v) => v.toLocaleString() },
  { key: "frequency",              label: "Frequency",      fmt: (v) => v.toFixed(2) },
  { key: "costPerResult",          label: "Cost/Result",    fmt: (v) => `$${v.toFixed(2)}` },
  { key: "spend",                  label: "Spent",          fmt: (v) => `$${v.toFixed(2)}` },
  { key: "impressions",            label: "Impressions",    fmt: (v) => v.toLocaleString() },
  { key: "cpm",                    label: "CPM",            fmt: (v) => `$${v.toFixed(2)}` },
  { key: "linkClicks",             label: "Link Clicks",    fmt: (v) => v.toLocaleString() },
  { key: "shopClicks",             label: "Shop Clicks",    fmt: (v) => v.toLocaleString() },
  { key: "cpc",                    label: "CPC",            fmt: (v) => `$${v.toFixed(2)}` },
  { key: "ctr",                    label: "CTR",            fmt: (v) => `${v.toFixed(2)}%` },
  { key: "clicks",                 label: "Clicks",         fmt: (v) => v.toLocaleString() },
  { key: "landingPageViews",       label: "LP Views",       fmt: (v) => v.toLocaleString() },
  { key: "costPerLandingPageView", label: "Cost/LP View",   fmt: (v) => `$${v.toFixed(2)}` },
];

// ─── Chart series config ──────────────────────────────────────────────────────

const CHART_SERIES = [
  { key: "spend",         label: "Spend",          color: "#6366f1", fmt: (v: number) => `$${v.toFixed(2)}` },
  { key: "impressions",   label: "Impressions",     color: "#4472c4", fmt: (v: number) => v.toLocaleString() },
  { key: "reach",         label: "Reach",           color: "#8b5cf6", fmt: (v: number) => v.toLocaleString() },
  { key: "cpc",           label: "CPC",             color: "#f59e0b", fmt: (v: number) => `$${v.toFixed(2)}` },
  { key: "ctr",           label: "CTR (%)",         color: "#10b981", fmt: (v: number) => `${v.toFixed(2)}%` },
  { key: "costPerResult", label: "Cost/Result",     color: "#ef4444", fmt: (v: number) => `$${v.toFixed(2)}` },
  { key: "frequency",     label: "Frequency",       color: "#f97316", fmt: (v: number) => v.toFixed(2) },
  { key: "purchases",     label: "Results",         color: "#c4d34f", fmt: (v: number) => v.toLocaleString() },
  { key: "cpm",           label: "CPM",             color: "#2d2d2d", fmt: (v: number) => `$${v.toFixed(2)}` },
] as const;

type ChartSeriesKey = typeof CHART_SERIES[number]["key"];

const DEFAULT_VISIBLE: ChartSeriesKey[] = ["spend", "impressions", "cpc", "ctr"];

// ─── Metrics Chart ─────────────────────────────────────────────────────────────

function MetricsChart({ rows, loading, storageKey }: {
  rows: DayRow[];
  loading: boolean;
  storageKey: string;
}) {
  const [visible, setVisible] = useState<Set<ChartSeriesKey>>(() => {
    if (typeof window === "undefined") return new Set(DEFAULT_VISIBLE);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return new Set(JSON.parse(stored) as ChartSeriesKey[]);
    } catch { /* ignore */ }
    return new Set(DEFAULT_VISIBLE);
  });

  function toggleSeries(key: ChartSeriesKey) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  const chartData = rows.map((r) => ({
    ...r,
    dateLabel: r.date ? format(new Date(r.date + "T00:00:00"), "MMM d") : r.date,
  }));

  const activeSeries = CHART_SERIES.filter((s) => visible.has(s.key));

  const maxima: Record<string, number> = {};
  for (const s of activeSeries) {
    maxima[s.key] = Math.max(...chartData.map((d) => (d as unknown as Record<string, number>)[s.key] ?? 0), 1);
  }

  const normalised = chartData.map((d) => {
    const out: Record<string, unknown> = { dateLabel: d.dateLabel };
    for (const s of activeSeries) {
      const raw = (d as unknown as Record<string, number>)[s.key] ?? 0;
      out[s.key] = maxima[s.key] > 0 ? (raw / maxima[s.key]) * 100 : 0;
      out[`__raw_${s.key}`] = raw;
    }
    return out;
  });

  if (loading) {
    return <div className="h-56 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />;
  }
  if (rows.length === 0) {
    return <div className="h-56 flex items-center justify-center text-zinc-400 text-sm">No data for this period.</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {CHART_SERIES.map((s) => (
          <button
            key={s.key}
            onClick={() => toggleSeries(s.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              visible.has(s.key)
                ? "border-transparent text-white"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 bg-transparent"
            }`}
            style={visible.has(s.key) ? { backgroundColor: s.color } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={normalised} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 11, fill: "var(--color-zinc-500)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, 110]} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-xs">
                  <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
                  {payload.map((entry) => {
                    const series = CHART_SERIES.find((s) => s.key === entry.dataKey);
                    if (!series) return null;
                    const raw = (entry.payload as Record<string, number>)[`__raw_${series.key}`] ?? 0;
                    return (
                      <div key={series.key} className="flex items-center gap-2 py-0.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: series.color }} />
                        <span className="text-zinc-500 dark:text-zinc-400">{series.label}:</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{series.fmt(raw)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {activeSeries.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              name={s.label}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ fullUrl, videoSourceUrl, onClose }: {
  fullUrl: string | null;
  videoSourceUrl: string | null;
  onClose: () => void;
}) {
  const { apiFetch } = useOrg();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!fullUrl || videoSourceUrl) return;
    let objectUrl: string | null = null;
    setImgError(null);
    setBlobUrl(null);
    apiFetch(`/api/meta/image-proxy?url=${encodeURIComponent(fullUrl)}`)
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          setImgError(`Proxy ${r.status}: ${text}`);
          return;
        }
        const blob = await r.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((e) => setImgError(String(e)));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fullUrl, videoSourceUrl, apiFetch]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
        aria-label="Close"
      >
        ×
      </button>
      <div
        className="flex items-center justify-center p-4"
        style={{ maxWidth: "min(90vw, 1080px)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {videoSourceUrl ? (
          <video src={videoSourceUrl} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg" />
        ) : blobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blobUrl} alt="Ad creative" className="rounded-lg" style={{ maxHeight: "90vh", maxWidth: "90vw" }} />
        ) : imgError ? (
          <div className="text-white/60 text-sm text-center max-w-sm">{imgError}</div>
        ) : (
          <div className="w-16 h-16 rounded bg-zinc-700 animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ─── Ad thumbnail ─────────────────────────────────────────────────────────────

function AdThumbnail({ adId }: { adId: string }) {
  const { apiFetch } = useOrg();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null | "loading">("loading");
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoSourceUrl, setVideoSourceUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/meta/ad-thumbnail?adId=${encodeURIComponent(adId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setThumbnailUrl(d.thumbnailUrl ?? null);
          setFullUrl(d.fullUrl ?? null);
          setVideoSourceUrl(d.videoSourceUrl ?? null);
        }
      })
      .catch(() => { if (!cancelled) setThumbnailUrl(null); });
    return () => { cancelled = true; };
  }, [adId, apiFetch]);

  if (thumbnailUrl === "loading") {
    return <div className="w-16 h-16 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse shrink-0" />;
  }
  if (!thumbnailUrl) {
    return (
      <div className="w-16 h-16 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-300 dark:text-zinc-600 text-xs">
        No img
      </div>
    );
  }
  return (
    <>
      <button
        onClick={() => setLightboxOpen(true)}
        className="shrink-0 rounded overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer"
        title="Click to enlarge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnailUrl} alt="Ad thumbnail" className="w-16 h-16 object-cover" />
      </button>
      {lightboxOpen && (
        <Lightbox fullUrl={fullUrl} videoSourceUrl={videoSourceUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

// ─── Ad creative chart (lazy) ─────────────────────────────────────────────────

function AdCreativeChart({ adId, from, to }: { adId: string; from: string; to: string }) {
  const { apiFetch } = useOrg();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adId || !from || !to) return;
    setLoading(true);
    const params = new URLSearchParams({ adId, from, to, groupBy: "day" });
    apiFetch(`/api/reports/facebook-ad-creatives?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [adId, from, to, apiFetch]);

  return (
    <div className="px-4 py-4 bg-zinc-50 dark:bg-zinc-900/70">
      <MetricsChart rows={rows} loading={loading} storageKey={`ad-chart-series-${adId}`} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdSetDetailPage() {
  const { id, adsetId } = useParams<{ id: string; adsetId: string }>();
  const router = useRouter();
  const { apiFetch, currentOrg } = useOrg();

  const [adsetName, setAdsetName] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [metaCampaignId, setMetaCampaignId] = useState<string | null>(null);
  const [utmCampaign, setUtmCampaign] = useState<string | null>(null);
  const [headerLoading, setHeaderLoading] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () => presets.find((p) => p.label === "Last 30 days")!.getValue()
  );

  const [chartRows, setChartRows] = useState<DayRow[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [creatives, setCreatives] = useState<AdCreativeRow[]>([]);
  const [creativesLoading, setCreativesLoading] = useState(false);
  const [expandedAd, setExpandedAd] = useState<string | null>(null);

  const [notebook, setNotebook] = useState("");
  const [tab, setTab] = useState<"charts" | "notebook">("charts");

  // ── Load campaign + adset name ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentOrg) return;
    setHeaderLoading(true);

    // Fetch campaigns list to find campaign name and meta IDs
    apiFetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        // We don't know which campaign this adset belongs to from the URL alone;
        // id is the campaign id from our DB
        const found = (d.campaigns ?? []).find((c: { id: number; campaign: string | null; utmCampaign: string | null; metaCampaignId: string | null }) => String(c.id) === String(id));
        if (found) {
          setCampaignName(found.campaign || found.utmCampaign || `Campaign #${id}`);
          setMetaCampaignId(found.metaCampaignId ?? null);
          setUtmCampaign(found.utmCampaign ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setHeaderLoading(false));
  }, [id, apiFetch, currentOrg]);

  // ── Load adset name + chart + creatives when campaign IDs + date range ready ──
  const loadData = useCallback(async () => {
    if (!metaCampaignId && !utmCampaign) return;
    const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
    const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";
    if (!from || !to) return;

    const baseParams = new URLSearchParams({ from, to });
    if (metaCampaignId) baseParams.set("campaignId", metaCampaignId);
    else if (utmCampaign) baseParams.set("utmCampaign", utmCampaign);

    setChartLoading(true);
    setCreativesLoading(true);

    // 1. Fetch adsets to find our adset name
    let resolvedAdsetName = adsetName;
    if (!resolvedAdsetName) {
      try {
        const r = await apiFetch(`/api/reports/facebook-adsets?${baseParams.toString()}`);
        const d = await r.json();
        const found = (d.rows ?? []).find((row: { adsetId: string; adset: string }) => row.adsetId === adsetId);
        if (found) {
          resolvedAdsetName = found.adset;
          setAdsetName(found.adset);
        }
      } catch { /* ignore */ }
    }

    // 2. Fetch adset chart (daily time series)
    const chartParams = new URLSearchParams({ from, to, groupBy: "day", adsetId });
    apiFetch(`/api/reports/facebook-adsets?${chartParams.toString()}`)
      .then((r) => r.json())
      .then((d) => setChartRows(d.rows ?? []))
      .catch(() => setChartRows([]))
      .finally(() => setChartLoading(false));

    // 3. Fetch creatives for this adset
    if (resolvedAdsetName) {
      const creativeParams = new URLSearchParams({ from, to, adset: resolvedAdsetName, adsetId });
      if (metaCampaignId) creativeParams.set("campaignId", metaCampaignId);
      else if (utmCampaign) creativeParams.set("utmCampaign", utmCampaign);

      apiFetch(`/api/reports/facebook-ad-creatives?${creativeParams.toString()}`)
        .then((r) => r.json())
        .then((d) => setCreatives(d.rows ?? []))
        .catch(() => setCreatives([]))
        .finally(() => setCreativesLoading(false));
    } else {
      setCreativesLoading(false);
    }
  }, [metaCampaignId, utmCampaign, dateRange, adsetId, adsetName, apiFetch]);

  useEffect(() => {
    if (metaCampaignId || utmCampaign) loadData();
  }, [metaCampaignId, utmCampaign, loadData]);

  // ── Derived strings ──────────────────────────────────────────────────────────
  const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const toStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  return (
    <PageLayout
      title={headerLoading || !adsetName ? "Loading..." : adsetName}
      subtitle="View ad creatives and performance metrics"
      actions={
        <>
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <button
              onClick={() => router.push("/campaigns")}
              className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Campaigns
            </button>
            <span>/</span>
            <button
              onClick={() => router.push(`/campaigns/${id}`)}
              className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              {headerLoading ? "..." : campaignName || `Campaign #${id}`}
            </button>
          </div>
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </>
      }
    >
      <div className="page-container">
      <div className="page-content">
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
            {(["charts", "notebook"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === "charts" && (
            <div className="space-y-6">
              {/* Ad set performance chart */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Performance over time</h2>
                <MetricsChart rows={chartRows} loading={chartLoading} storageKey={`adset-chart-series-${adsetId}`} />
              </div>

              {/* Ad creatives table */}
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="pl-4 pr-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        Ad Creative
                      </th>
                      {METRIC_COLS.map((col) => (
                        <th key={col.key} className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {creativesLoading ? (
                      [...Array(3)].map((_, i) => (
                        <tr key={i}>
                          <td colSpan={METRIC_COLS.length + 1} className="px-4 py-3">
                            <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                          </td>
                        </tr>
                      ))
                    ) : creatives.length === 0 ? (
                      <tr>
                        <td colSpan={METRIC_COLS.length + 1} className="px-4 py-8 text-center text-zinc-400 text-xs">
                          No ad creative data found for this date range.
                        </td>
                      </tr>
                    ) : (
                      creatives.map((ad) => (
                        <>
                          <tr
                            key={`ad-${ad.adId}`}
                            className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                            onClick={() => setExpandedAd(expandedAd === ad.adId ? null : ad.adId)}
                          >
                            {/* Ad name + thumbnail */}
                            <td className="pl-4 pr-2 py-3 text-xs">
                              <div className="flex items-start gap-3">
                                <svg
                                  className={`w-3 h-3 mt-1 shrink-0 text-zinc-400 transition-transform ${expandedAd === ad.adId ? "rotate-90" : ""}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                                <AdThumbnail adId={ad.adId} />
                                <span className="text-zinc-600 dark:text-zinc-300 leading-snug pt-1 max-w-[200px] truncate">
                                  {ad.ad || "—"}
                                </span>
                              </div>
                            </td>
                            {METRIC_COLS.map((col) => (
                              <td key={col.key} className="px-4 py-3 text-xs text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap tabular-nums">
                                {col.fmt((ad as unknown as Record<string, number>)[col.key] ?? 0)}
                              </td>
                            ))}
                          </tr>
                          {/* Expanded chart row */}
                          {expandedAd === ad.adId && (
                            <tr key={`ad-chart-${ad.adId}`}>
                              <td colSpan={METRIC_COLS.length + 1} className="p-0 border-b border-zinc-100 dark:border-zinc-800">
                                <AdCreativeChart adId={ad.adId} from={fromStr} to={toStr} />
                              </td>
                            </tr>
                          )}
                        </>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "notebook" && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
              <textarea
                value={notebook}
                onChange={(e) => setNotebook(e.target.value)}
                placeholder="Notes, observations, and context for this ad set…"
                className="w-full min-h-[240px] resize-y rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <p className="text-xs text-zinc-400 mt-1.5">AI features will use this as context. (Persistence coming soon.)</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </PageLayout>
  );
}
