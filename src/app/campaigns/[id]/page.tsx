"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, subDays, startOfDay, endOfYesterday } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets } from "@/components/DateRangePicker";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: number;
  campaign: string | null;
  utmCampaign: string | null;
  metaCampaignId: string | null;
}

interface AdSetRow {
  adsetId: string;
  adset: string;
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

// ─── Metric columns config ────────────────────────────────────────────────────

const METRIC_COLS: { key: keyof AdSetRow | keyof AdCreativeRow; label: string; fmt: (v: number) => string }[] = [
  { key: "purchases",              label: "Results",             fmt: (v) => v.toLocaleString() },
  { key: "reach",                  label: "Reach",               fmt: (v) => v.toLocaleString() },
  { key: "frequency",              label: "Frequency",           fmt: (v) => v.toFixed(2) },
  { key: "costPerResult",          label: "Cost/Result",         fmt: (v) => `$${v.toFixed(2)}` },
  { key: "spend",                  label: "Spent",               fmt: (v) => `$${v.toFixed(2)}` },
  { key: "impressions",            label: "Impressions",         fmt: (v) => v.toLocaleString() },
  { key: "cpm",                    label: "CPM",                 fmt: (v) => `$${v.toFixed(2)}` },
  { key: "linkClicks",             label: "Link Clicks",         fmt: (v) => v.toLocaleString() },
  { key: "shopClicks",             label: "Shop Clicks",         fmt: (v) => v.toLocaleString() },
  { key: "cpc",                    label: "CPC",                 fmt: (v) => `$${v.toFixed(2)}` },
  { key: "ctr",                    label: "CTR",                 fmt: (v) => `${v.toFixed(2)}%` },
  { key: "clicks",                 label: "Clicks",              fmt: (v) => v.toLocaleString() },
  { key: "landingPageViews",       label: "LP Views",            fmt: (v) => v.toLocaleString() },
  { key: "costPerLandingPageView", label: "Cost/LP View",        fmt: (v) => `$${v.toFixed(2)}` },
];

// ─── Chart series config ──────────────────────────────────────────────────────

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

// Default visible series
const DEFAULT_VISIBLE: ChartSeriesKey[] = ["spend", "impressions", "cpc", "ctr"];

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

  // Normalise values so all visible series can share one Y axis
  // We scale each series to 0-100 range internally and show raw values in tooltip
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
      {/* Series toggles */}
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

  // Fetch image through apiFetch (which sends org headers) and create a blob URL
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
          <video
            src={videoSourceUrl}
            controls
            autoPlay
            className="max-w-full max-h-[80vh] rounded-lg"
          />
        ) : blobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blobUrl}
            alt="Ad creative"
            className="rounded-lg"
            style={{ maxHeight: "90vh", maxWidth: "90vw" }}
          />
        ) : imgError ? (
          <div className="text-white/60 text-sm text-center max-w-sm">{imgError}</div>
        ) : (
          <div className="w-16 h-16 rounded bg-zinc-700 animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ─── Ad thumbnail component ───────────────────────────────────────────────────

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
    return <div className="w-16 h-16 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-300 dark:text-zinc-600 text-xs">No img</div>;
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

// ─── Ad creative chart (lazy, rendered only when expanded) ────────────────────

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

// ─── Ad creatives sub-row ─────────────────────────────────────────────────────

function AdCreativesRow({
  campaignId,
  utmCampaign,
  adsetId,
  adset,
  from,
  to,
  apiFetch,
}: {
  campaignId: string;
  utmCampaign: string;
  adsetId: string;
  adset: string;
  from: string;
  to: string;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  const [rows, setRows] = useState<AdCreativeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAd, setExpandedAd] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ from, to, adset });
    if (campaignId) params.set("campaignId", campaignId);
    if (utmCampaign) params.set("utmCampaign", utmCampaign);
    if (adsetId) params.set("adsetId", adsetId);

    apiFetch(`/api/reports/facebook-ad-creatives?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [campaignId, utmCampaign, adsetId, adset, from, to, apiFetch]);

  if (loading) {
    return (
      <tr>
        <td colSpan={METRIC_COLS.length + 2} className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
          <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
        </td>
      </tr>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <tr>
        <td colSpan={METRIC_COLS.length + 2} className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
          No ads found for this ad set.
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map((ad) => (
        <>
          <tr
            key={`ad-${ad.adId}`}
            className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
            onClick={() => setExpandedAd(expandedAd === ad.adId ? null : ad.adId)}
          >
            {/* Ad name + thumbnail */}
            <td className="pl-10 pr-2 py-3 text-xs">
              <div className="flex items-start gap-3">
                <svg
                  className={`w-3 h-3 mt-1 shrink-0 text-zinc-400 transition-transform ${expandedAd === ad.adId ? "rotate-90" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
                <AdThumbnail adId={ad.adId} />
                <span className="text-zinc-600 dark:text-zinc-300 leading-snug pt-1 max-w-[180px] truncate">{ad.ad || "—"}</span>
              </div>
            </td>
            {METRIC_COLS.map((col) => (
              <td key={col.key} className="px-4 py-3 text-xs text-right text-zinc-500 dark:text-zinc-400 whitespace-nowrap tabular-nums">
                {col.fmt((ad as unknown as Record<string, number>)[col.key] ?? 0)}
              </td>
            ))}
            {/* placeholder for the → button column */}
            <td className="px-2 py-3" />
          </tr>
          {/* Expanded chart row */}
          {expandedAd === ad.adId && (
            <tr key={`ad-chart-${ad.adId}`}>
              <td colSpan={METRIC_COLS.length + 2} className="p-0 border-b border-zinc-100 dark:border-zinc-800">
                <AdCreativeChart adId={ad.adId} from={from} to={to} />
              </td>
            </tr>
          )}
        </>
      ))}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { apiFetch, currentOrg } = useOrg();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () => presets.find((p) => p.label === "Last 30 days")!.getValue()
  );

  const [adsets, setAdsets] = useState<AdSetRow[]>([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [expandedAdset, setExpandedAdset] = useState<string | null>(null);

  const [chartRows, setChartRows] = useState<DayRow[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [notebook, setNotebook] = useState("");
  const [tab, setTab] = useState<"charts" | "notebook">("charts");

  // ── Load campaign record ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentOrg) return; // wait for org context to be ready before fetching
    setCampaignLoading(true);
    apiFetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        const found = (d.campaigns ?? []).find((c: Campaign) => String(c.id) === String(id));
        setCampaign(found ?? null);
      })
      .catch(() => setCampaign(null))
      .finally(() => setCampaignLoading(false));
  }, [id, apiFetch, currentOrg]);

  // ── Load ad sets + campaign chart ───────────────────────────────────────────
  const loadAdsets = useCallback(async () => {
    if (!campaign) return;
    const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
    const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";
    if (!from || !to) return;
    if (!campaign.metaCampaignId && !campaign.utmCampaign) return;

    const params = new URLSearchParams({ from, to });
    if (campaign.metaCampaignId) params.set("campaignId", campaign.metaCampaignId);
    else if (campaign.utmCampaign) params.set("utmCampaign", campaign.utmCampaign);

    setAdsetsLoading(true);
    setChartLoading(true);

    await Promise.all([
      apiFetch(`/api/reports/facebook-adsets?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setAdsets(d.rows ?? []))
        .catch(() => setAdsets([]))
        .finally(() => setAdsetsLoading(false)),

      apiFetch(`/api/reports/facebook-campaigns?${params.toString()}&groupBy=day`)
        .then((r) => r.json())
        .then((d) => setChartRows(d.rows ?? []))
        .catch(() => setChartRows([]))
        .finally(() => setChartLoading(false)),
    ]);
  }, [campaign, dateRange, apiFetch]);

  useEffect(() => {
    if (campaign) loadAdsets();
  }, [campaign, loadAdsets]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const toStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/campaigns")}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Campaigns
            </button>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {campaignLoading ? (
                <span className="inline-block h-5 w-48 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              ) : (
                campaign?.campaign || campaign?.utmCampaign || `Campaign #${id}`
              )}
            </h1>
          </div>
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>
      </div>

      {/* Content */}
      <div className="page-content">
        {/* Missing Meta Campaign ID warning */}
        {!campaignLoading && campaign && !campaign.metaCampaignId && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              <strong>Meta Campaign ID not set.</strong> Open this campaign in the Campaigns list, click Edit, and add the numeric campaign ID from Meta Ads Manager. Without it, ad set data cannot be loaded.
            </span>
          </div>
        )}

        {campaignLoading ? (
          <div className="space-y-2 pt-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        ) : !campaign && !campaignLoading ? (
          <div className="pt-8 text-center text-zinc-400">Campaign not found.</div>
        ) : !campaign ? null : (
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
                {/* Campaign chart */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Performance over time</h2>
                  <MetricsChart rows={chartRows} loading={chartLoading} storageKey={`campaign-chart-series-${id}`} />
                </div>

                {/* Ad sets table */}
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                        <th className="pl-4 pr-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          Ad Set
                        </th>
                        {METRIC_COLS.map((col) => (
                          <th key={col.key} className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                        <th className="px-2 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {adsetsLoading ? (
                        [...Array(4)].map((_, i) => (
                          <tr key={i}>
                            <td colSpan={METRIC_COLS.length + 2} className="px-4 py-3">
                              <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                            </td>
                          </tr>
                        ))
                      ) : adsets.length === 0 ? (
                        <tr>
                          <td colSpan={METRIC_COLS.length + 2} className="px-4 py-8 text-center text-zinc-400 text-xs">
                            No ad set data found for this date range.
                          </td>
                        </tr>
                      ) : (
                        adsets.map((row) => (
                          <>
                            {/* Ad set row */}
                            <tr
                              key={`adset-${row.adsetId}`}
                              onClick={() => setExpandedAdset(expandedAdset === row.adsetId ? null : row.adsetId)}
                              className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                            >
                              <td className="pl-4 pr-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <svg
                                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expandedAdset === row.adsetId ? "rotate-90" : ""}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                  </svg>
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 max-w-[220px] truncate">
                                    {row.adset || "—"}
                                  </span>
                                </div>
                              </td>
                              {METRIC_COLS.map((col) => (
                                <td key={col.key} className="px-4 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300 whitespace-nowrap tabular-nums">
                                  {col.fmt((row as unknown as Record<string, number>)[col.key] ?? 0)}
                                </td>
                              ))}
                              {/* Navigate to ad set detail page */}
                              <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => router.push(`/campaigns/${id}/adsets/${row.adsetId}`)}
                                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                  title="Open ad set detail"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </button>
                              </td>
                            </tr>

                            {/* Expanded ads sub-rows */}
                            {expandedAdset === row.adsetId && (
                              <AdCreativesRow
                                key={`creatives-${row.adsetId}`}
                                campaignId={campaign.metaCampaignId ?? ""}
                                utmCampaign={campaign.utmCampaign ?? ""}
                                adsetId={row.adsetId}
                                adset={row.adset}
                                from={fromStr}
                                to={toStr}
                                apiFetch={apiFetch}
                              />
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
                  placeholder="Notes, observations, and context for this campaign…"
                  className="w-full min-h-[240px] resize-y rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
                <p className="text-xs text-zinc-400 mt-1.5">AI features will use this as context. (Persistence coming soon.)</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
