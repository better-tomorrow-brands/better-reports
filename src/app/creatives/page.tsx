"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { Loader2, Download, Sparkles } from "lucide-react";

interface Product {
  id: number;
  title: string;
  image: string | null;
}

interface GeneratedCreative {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
}

export default function CreativesPage() {
  const { apiFetch } = useOrg();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [generatedCreatives, setGeneratedCreatives] = useState<GeneratedCreative[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [brandGuidelines, setBrandGuidelines] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [adAngle, setAdAngle] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [numVariations, setNumVariations] = useState(3);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [productsRes, creativesRes] = await Promise.all([
        apiFetch("/api/products"),
        apiFetch("/api/creatives").catch(() => ({ ok: false })),
      ]);

      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
      }

      if (creativesRes.ok) {
        const data = await creativesRes.json();
        setGeneratedCreatives(data.creatives || []);
      }
    } catch (err) {
      setMessage({ type: "error", text: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  }

  async function generateCreatives() {
    if (!campaignGoal.trim()) {
      setMessage({ type: "error", text: "Please enter a campaign goal" });
      return;
    }

    setGenerating(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/creatives/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct,
          brandGuidelines,
          campaignGoal,
          adAngle,
          customPrompt,
          numVariations,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate creatives");
      }

      const data = await res.json();
      setGeneratedCreatives([...data.creatives, ...generatedCreatives]);
      setMessage({ type: "success", text: `Generated ${data.creatives.length} creative(s)!` });

      // Reset form
      setCampaignGoal("");
      setAdAngle("");
      setCustomPrompt("");
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-zinc-100 dark:bg-zinc-900 rounded-lg animate-pulse" />
          <div className="h-96 bg-zinc-100 dark:bg-zinc-900 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const selectedProductData = products.find((p) => p.id === selectedProduct);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-400" />
        <h1 className="text-2xl font-bold">AI Creative Generator</h1>
      </div>

      {message && (
        <div
          className={`mb-6 p-3 rounded-md text-sm ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Generation Form */}
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Campaign Brief</h2>

          <div className="space-y-5">
            {/* Campaign Goal */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Campaign Goal <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={campaignGoal}
                onChange={(e) => setCampaignGoal(e.target.value)}
                placeholder="e.g., Summer sale, New product launch, Holiday gift guide"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
            </div>

            {/* Product Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Product (Optional)
              </label>
              <select
                value={selectedProduct || ""}
                onChange={(e) => setSelectedProduct(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value="">No specific product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
              {selectedProductData?.image && (
                <img
                  src={selectedProductData.image}
                  alt={selectedProductData.title}
                  className="mt-2 w-32 h-32 object-cover rounded border border-zinc-200 dark:border-zinc-700"
                />
              )}
            </div>

            {/* Brand Guidelines */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Brand Guidelines (Optional)
              </label>
              <textarea
                value={brandGuidelines}
                onChange={(e) => setBrandGuidelines(e.target.value)}
                placeholder="Brand colors, tone of voice, key messaging, visual style..."
                rows={4}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Describe your brand's visual identity, messaging style, and any rules to follow.
              </p>
            </div>

            {/* Ad Angle */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Ad Angle (Optional)
              </label>
              <input
                type="text"
                value={adAngle}
                onChange={(e) => setAdAngle(e.target.value)}
                placeholder="e.g., Benefit-focused, Emotion-driven, Problem-solution"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Additional Instructions (Optional)
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Any specific requirements for the creative..."
                rows={3}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
            </div>

            {/* Number of Variations */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Number of Variations
              </label>
              <select
                value={numVariations}
                onChange={(e) => setNumVariations(Number(e.target.value))}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value={1}>1 variation</option>
                <option value={2}>2 variations</option>
                <option value={3}>3 variations</option>
                <option value={4}>4 variations</option>
                <option value={5}>5 variations</option>
              </select>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateCreatives}
              disabled={generating || !campaignGoal.trim()}
              className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-medium rounded-md disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Creatives
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right: Generated Creatives Gallery */}
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Generated Creatives</h2>

          {generatedCreatives.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No creatives generated yet.</p>
              <p className="mt-1">Fill out the form and click "Generate Creatives" to start.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {generatedCreatives.map((creative) => (
                <div
                  key={creative.id}
                  className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden"
                >
                  <img
                    src={creative.imageUrl}
                    alt="Generated creative"
                    className="w-full h-auto"
                  />
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-2">
                      {creative.prompt}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">
                        {new Date(creative.createdAt).toLocaleDateString()}
                      </span>
                      <a
                        href={creative.imageUrl}
                        download
                        className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded text-xs font-medium"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
