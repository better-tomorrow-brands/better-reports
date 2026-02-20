"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { Loader2, Download, Sparkles, Trash2, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

interface Product {
  id: number;
  productName: string | null;
  sku: string;
}

interface GeneratedCreative {
  id: string;
  imageUrl: string;
  prompt: string;
  campaignGoal: string;
  targetCta: string | null;
  adAngle: string | null;
  customPrompt: string | null;
  brandGuidelines: string | null;
  productId: number | null;
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  callToAction: string | null;
  createdAt: string;
}

export default function CreativesPage() {
  const { apiFetch, currentOrg, isLoading: orgLoading } = useOrg();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [generatedCreatives, setGeneratedCreatives] = useState<GeneratedCreative[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [brandGuidelines, setBrandGuidelines] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [targetCta, setTargetCta] = useState("");
  const [adAngle, setAdAngle] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [numVariations, setNumVariations] = useState(3);
  const [contextImages, setContextImages] = useState<File[]>([]);
  const [expandedCreatives, setExpandedCreatives] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Wait for org context to be ready before loading data
    if (!orgLoading && currentOrg) {
      loadData();
    }
  }, [orgLoading, currentOrg]);

  async function loadData() {
    try {
      const productsRes = await apiFetch("/api/products");
      if (productsRes.ok) {
        const data = await productsRes.json();
        // Products API returns array directly, not { products: [...] }
        setProducts(Array.isArray(data) ? data : []);
      }

      // Load creatives separately with error handling
      try {
        const creativesRes = await apiFetch("/api/creatives");
        if (creativesRes.ok) {
          const data = await creativesRes.json();
          setGeneratedCreatives(data.creatives || []);
        }
      } catch (err) {
        // Creatives endpoint might not exist yet or fail - that's ok
        console.log("Could not load creatives:", err);
      }
    } catch (err) {
      setMessage({ type: "error", text: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  }

  function toggleCreativeExpanded(id: string) {
    const newExpanded = new Set(expandedCreatives);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCreatives(newExpanded);
  }

  function reusePrompt(creative: GeneratedCreative) {
    setCampaignGoal(creative.campaignGoal);
    setTargetCta(creative.targetCta || "");
    setAdAngle(creative.adAngle || "");
    setCustomPrompt(creative.customPrompt || "");
    setBrandGuidelines(creative.brandGuidelines || "");
    setSelectedProduct(creative.productId);
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generateCreatives() {
    if (!campaignGoal.trim()) {
      setMessage({ type: "error", text: "Please enter a campaign goal" });
      return;
    }

    if (!targetCta.trim()) {
      setMessage({ type: "error", text: "Please enter a target action/CTA" });
      return;
    }

    setGenerating(true);
    setMessage(null);

    try {
      // Use FormData to support image uploads
      const formData = new FormData();
      formData.append("campaignGoal", campaignGoal);
      formData.append("targetCta", targetCta);
      if (selectedProduct) formData.append("productId", selectedProduct.toString());
      if (brandGuidelines) formData.append("brandGuidelines", brandGuidelines);
      if (adAngle) formData.append("adAngle", adAngle);
      if (customPrompt) formData.append("customPrompt", customPrompt);
      formData.append("numVariations", numVariations.toString());

      // Add context images
      contextImages.forEach((file, index) => {
        formData.append(`contextImage${index}`, file);
      });
      formData.append("numContextImages", contextImages.length.toString());

      const res = await apiFetch("/api/creatives/generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate creatives");
      }

      const data = await res.json();
      setGeneratedCreatives([...data.creatives, ...generatedCreatives]);
      setMessage({ type: "success", text: `Generated ${data.creatives.length} creative(s)!` });

      // Don't reset form - let user generate more variations with same settings
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setGenerating(false);
    }
  }

  if (loading || orgLoading) {
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
        <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">Powered by Google Gemini</span>
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
                placeholder="e.g., Drive sales, Lead generation, Brand awareness, Product launch"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                What's the primary objective? (sales, leads, awareness, engagement, etc.)
              </p>
            </div>

            {/* Target CTA */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Action <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={targetCta}
                onChange={(e) => setTargetCta(e.target.value)}
                placeholder="e.g., Subscribe now, Shop 35% off, Try risk-free, Sign up for updates"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                What action should people take? This guides the call-to-action button text.
              </p>
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
                    {product.productName || product.sku}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand Guidelines */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Brand Guidelines (Optional)</span>
                <span className={`text-xs ${brandGuidelines.length > 300 ? 'text-red-500' : 'text-zinc-400'}`}>
                  {brandGuidelines.length}/300
                </span>
              </label>
              <textarea
                value={brandGuidelines}
                onChange={(e) => setBrandGuidelines(e.target.value)}
                maxLength={300}
                placeholder="Brand colors, tone of voice, key messaging, visual style..."
                rows={4}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Visual style keywords (300 char max - will be lowercased)
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

            {/* Context Images */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Reference Images (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setContextImages(files);
                }}
                value=""
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:text-sm file:font-medium"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Upload product photos, inspiration images, or style references for AI to analyze.
              </p>
              {contextImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {contextImages.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Context ${index + 1}`}
                        className="w-20 h-20 object-cover rounded border border-zinc-200 dark:border-zinc-700"
                      />
                      <button
                        onClick={() => {
                          const newImages = contextImages.filter((_, i) => i !== index);
                          setContextImages(newImages);
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Additional Instructions (Optional)</span>
                <span className={`text-xs ${customPrompt.length > 500 ? 'text-red-500' : 'text-zinc-400'}`}>
                  {customPrompt.length}/500
                </span>
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                maxLength={500}
                placeholder="Any specific requirements for the creative..."
                rows={3}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Specific visual requirements (500 char max)
              </p>
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
              disabled={generating || !campaignGoal.trim() || !targetCta.trim()}
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
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 space-y-3">
                    {/* Ad Copy Section */}
                    {(creative.headline || creative.primaryText || creative.description || creative.callToAction) && (
                      <div className="space-y-2 pb-3 border-b border-zinc-200 dark:border-zinc-700">
                        {creative.headline && (
                          <div>
                            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                              HEADLINE
                            </div>
                            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                              {creative.headline}
                            </div>
                          </div>
                        )}
                        {creative.primaryText && (
                          <div>
                            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                              PRIMARY TEXT
                            </div>
                            <div className="text-sm text-zinc-800 dark:text-zinc-200">
                              {creative.primaryText}
                            </div>
                          </div>
                        )}
                        {creative.description && (
                          <div>
                            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                              DESCRIPTION
                            </div>
                            <div className="text-sm text-zinc-700 dark:text-zinc-300">
                              {creative.description}
                            </div>
                          </div>
                        )}
                        {creative.callToAction && (
                          <div>
                            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                              CALL TO ACTION
                            </div>
                            <div className="inline-block px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded">
                              {creative.callToAction}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prompt Details Accordion */}
                    <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                      <button
                        onClick={() => toggleCreativeExpanded(creative.id)}
                        className="w-full flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        <span>Prompt Details</span>
                        {expandedCreatives.has(creative.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {expandedCreatives.has(creative.id) && (
                        <div className="mt-3 space-y-2 text-xs">
                          <div>
                            <span className="font-semibold text-zinc-600 dark:text-zinc-400">Campaign Goal:</span>
                            <p className="text-zinc-800 dark:text-zinc-200 mt-1">{creative.campaignGoal}</p>
                          </div>
                          {creative.targetCta && (
                            <div>
                              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Target Action:</span>
                              <p className="text-zinc-800 dark:text-zinc-200 mt-1">{creative.targetCta}</p>
                            </div>
                          )}
                          {creative.brandGuidelines && (
                            <div>
                              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Brand Guidelines:</span>
                              <p className="text-zinc-800 dark:text-zinc-200 mt-1">{creative.brandGuidelines}</p>
                            </div>
                          )}
                          {creative.adAngle && (
                            <div>
                              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Ad Angle:</span>
                              <p className="text-zinc-800 dark:text-zinc-200 mt-1">{creative.adAngle}</p>
                            </div>
                          )}
                          {creative.customPrompt && (
                            <div>
                              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Additional Instructions:</span>
                              <p className="text-zinc-800 dark:text-zinc-200 mt-1">{creative.customPrompt}</p>
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-zinc-600 dark:text-zinc-400">Final Prompt:</span>
                            <p className="text-zinc-800 dark:text-zinc-200 mt-1 font-mono text-[10px]">{creative.prompt}</p>
                          </div>
                          <button
                            onClick={() => reusePrompt(creative)}
                            className="w-full mt-3 inline-flex items-center justify-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Use This Prompt
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-700">
                      <span className="text-xs text-zinc-500">
                        {new Date(creative.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setGeneratedCreatives(generatedCreatives.filter((c) => c.id !== creative.id));
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-xs font-medium"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
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
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
