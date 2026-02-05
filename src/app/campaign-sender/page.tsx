"use client";

import { useState, useRef, useEffect } from "react";

interface CsvRow {
  phone: string;
  first_name: string;
  [key: string]: string;
}

interface SendResult {
  phone: string;
  first_name: string;
  status: "pending" | "sending" | "success" | "error";
  message?: string;
}

interface Template {
  name: string;
  status: string;
  language: string;
  params: { name: string }[];
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const phoneIdx = headers.indexOf("phone");
  const nameIdx = headers.indexOf("first_name");

  if (phoneIdx === -1 || nameIdx === -1) return [];

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: CsvRow = { phone: "", first_name: "" };
      headers.forEach((header, i) => {
        row[header] = values[i] || "";
      });
      return row;
    });
}

export default function CampaignSender() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [results, setResults] = useState<SendResult[]>([]);
  const [sending, setSending] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    fetch("/api/whatsapp/templates")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setTemplatesError(data.error);
        } else {
          setTemplates(data.templates || []);
        }
      })
      .catch(() => setTemplatesError("Failed to load templates"))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const template = templates.find((t) => t.name === selectedTemplate);

  const missingColumns = template
    ? template.params.filter(
        (p) => csvData.length > 0 && !(p.name in csvData[0])
      )
    : [];

  const canSend =
    csvData.length > 0 &&
    selectedTemplate &&
    missingColumns.length === 0 &&
    !sending;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResults([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCsv(text);
      setCsvData(rows);
    };
    reader.readAsText(file);
  }

  async function handleSend() {
    if (!template) return;

    setSending(true);
    abortRef.current = false;

    const initialResults: SendResult[] = csvData.map((row) => ({
      phone: row.phone,
      first_name: row.first_name,
      status: "pending",
    }));
    setResults(initialResults);

    for (let i = 0; i < csvData.length; i++) {
      if (abortRef.current) break;

      const row = csvData[i];
      const params = template.params.map((p) => row[p.name] || "");

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "sending" } : r))
      );

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: row.phone,
            template_name: template.name,
            params,
          }),
        });

        const data = await res.json();

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: res.ok ? "success" : "error",
                  message: res.ok ? "Sent" : data.details || data.error,
                }
              : r
          )
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error",
                  message:
                    err instanceof Error ? err.message : "Network error",
                }
              : r
          )
        );
      }
    }

    setSending(false);
  }

  function handleStop() {
    abortRef.current = true;
  }

  function handleReset() {
    setCsvData([]);
    setResults([]);
    setFileName("");
    setSelectedTemplate("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">WhatsApp Campaign Sender</h1>

      {/* Template Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Template</label>
        {templatesLoading ? (
          <p className="text-sm text-zinc-500">Loading templates...</p>
        ) : templatesError ? (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
            {templatesError}
          </div>
        ) : (
          <>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
              disabled={sending}
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            {template && (
              <p className="text-sm text-zinc-500 mt-1">
                Required CSV columns: phone,{" "}
                {template.params.map((p) => p.name).join(", ")}
              </p>
            )}
          </>
        )}
      </div>

      {/* CSV Upload */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">CSV File</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={sending}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900 hover:file:opacity-80 cursor-pointer"
        />
        {fileName && (
          <p className="text-sm text-zinc-500 mt-1">
            {fileName} - {csvData.length} rows loaded
          </p>
        )}
      </div>

      {/* Missing columns warning */}
      {missingColumns.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
          CSV is missing required columns:{" "}
          {missingColumns.map((p) => p.name).join(", ")}
        </div>
      )}

      {/* Preview Table */}
      {csvData.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <h2 className="text-sm font-medium mb-2">
            Preview ({csvData.length} contacts)
          </h2>
          <table className="w-full text-sm border border-zinc-200 dark:border-zinc-700">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800">
                {Object.keys(csvData[0]).map((header) => (
                  <th
                    key={header}
                    className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvData.slice(0, 10).map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-3 py-2">
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
              {csvData.length > 10 && (
                <tr>
                  <td
                    colSpan={Object.keys(csvData[0]).length}
                    className="px-3 py-2 text-zinc-500 text-center"
                  >
                    ... and {csvData.length - 10} more rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Send / Stop / Reset buttons */}
      <div className="flex gap-3 mb-6">
        {!sending ? (
          <>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Campaign ({csvData.length} messages)
            </button>
            {results.length > 0 && (
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Reset
              </button>
            )}
          </>
        ) : (
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700"
          >
            Stop Sending
          </button>
        )}
      </div>

      {/* Results Log */}
      {results.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">
            Results
            {(successCount > 0 || errorCount > 0) && (
              <span className="font-normal text-zinc-500 ml-2">
                {successCount} sent, {errorCount} failed,{" "}
                {results.length - successCount - errorCount} remaining
              </span>
            )}
          </h2>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-md max-h-80 overflow-y-auto">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-3 py-2 text-sm border-b last:border-b-0 border-zinc-100 dark:border-zinc-800 ${
                  r.status === "success"
                    ? "bg-green-50 dark:bg-green-950"
                    : r.status === "error"
                      ? "bg-red-50 dark:bg-red-950"
                      : r.status === "sending"
                        ? "bg-blue-50 dark:bg-blue-950"
                        : ""
                }`}
              >
                <span>
                  {r.first_name} ({r.phone})
                </span>
                <span
                  className={
                    r.status === "success"
                      ? "text-green-600"
                      : r.status === "error"
                        ? "text-red-600"
                        : r.status === "sending"
                          ? "text-blue-600"
                          : "text-zinc-400"
                  }
                >
                  {r.status === "pending" && "Pending"}
                  {r.status === "sending" && "Sending..."}
                  {r.status === "success" && "Sent"}
                  {r.status === "error" && (r.message || "Failed")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
