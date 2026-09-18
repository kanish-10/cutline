"use client";

import type { ExportOptions } from "@cutline/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check,
  ChevronDown,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { QueryProvider } from "@/components/query-provider";
import { api } from "@/lib/api";

function ExportPageContent() {
  const _queryClient = useQueryClient();
  const [options, setOptions] = useState<ExportOptions>({
    format: "json",
    includeArchived: false,
    includeChecklists: true,
    includeTags: true,
    includeLinks: true,
  });
  const [selectedBoard, setSelectedBoard] = useState<string>("all");
  const [dateRange, setDateRange] = useState<
    Partial<{ start: string; end: string }> | undefined
  >();

  const { data: boards } = useQuery({
    queryKey: ["boards"],
    queryFn: () => api.getBoards(),
  });

  const exportMutation = useMutation({
    mutationFn: api.exportBoard,
    onSuccess: (blob, opts) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cutline-export-${format(new Date(), "yyyy-MM-dd")}.${opts.format === "json" ? "json" : opts.format === "csv" ? "csv" : "json"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    exportMutation.mutate(options);
  };

  const formatOptions = [
    {
      value: "json",
      label: "JSON",
      icon: FileText,
      desc: "Complete data with all fields",
    },
    {
      value: "csv",
      label: "CSV",
      icon: FileSpreadsheet,
      desc: "Spreadsheet-compatible format",
    },
    {
      value: "notion",
      label: "Notion",
      icon: Database,
      desc: "Notion database import format",
    },
  ];

  if (exportMutation.isPending) {
    return (
      <div className="export-page">
        <header className="page-header">
          <h1>Export Board</h1>
        </header>
        <div className="export-progress">
          <Loader2 className="icon spin large" />
          <p>Preparing your export...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="export-page">
      <header className="page-header">
        <div>
          <h1>Export Data</h1>
          <p className="muted">
            Download your boards in various formats for backup, migration, or
            analysis
          </p>
        </div>
      </header>

      <section className="export-options" aria-label="Export configuration">
        <article className="option-card">
          <header>
            <h2>Format</h2>
            <p className="muted">Choose the output format for your export</p>
          </header>
          <div className="format-options">
            {formatOptions.map((fmt) => (
              <button
                key={fmt.value}
                className={`format-option ${options.format === fmt.value ? "selected" : ""}`}
                onClick={() =>
                  setOptions({
                    ...options,
                    format: fmt.value as ExportOptions["format"],
                  })
                }
              >
                <fmt.icon className="icon" />
                <div>
                  <strong>{fmt.label}</strong>
                  <span className="muted">{fmt.desc}</span>
                </div>
                {options.format === fmt.value && (
                  <Check className="icon check" />
                )}
              </button>
            ))}
          </div>
        </article>

        <article className="option-card">
          <header>
            <h2>Board Selection</h2>
            <p className="muted">Choose which boards to export</p>
          </header>
          <label className="board-select">
            <select
              value={selectedBoard}
              onChange={(e) => setSelectedBoard(e.target.value)}
              disabled={boards === undefined}
            >
              <option value="all">All Boards</option>
              {boards?.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
            <ChevronDown className="icon" />
          </label>
        </article>

        <article className="option-card">
          <header>
            <h2>Date Range (Optional)</h2>
            <p className="muted">Filter cards by creation date</p>
          </header>
          <div className="date-range-inputs">
            <label>
              From
              <input
                type="date"
                value={dateRange?.start || ""}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start: e.target.value })
                }
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={dateRange?.end || ""}
                onChange={(e) =>
                  setDateRange({ ...dateRange, end: e.target.value })
                }
              />
            </label>
          </div>
        </article>

        <article className="option-card">
          <header>
            <h2>Content Options</h2>
            <p className="muted">Choose what data to include in the export</p>
          </header>
          <div className="content-options">
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={options.includeArchived}
                onChange={(e) =>
                  setOptions({ ...options, includeArchived: e.target.checked })
                }
              />
              <span>Include archived cards</span>
            </label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={options.includeChecklists}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    includeChecklists: e.target.checked,
                  })
                }
              />
              <span>Include checklists</span>
            </label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={options.includeTags}
                onChange={(e) =>
                  setOptions({ ...options, includeTags: e.target.checked })
                }
              />
              <span>Include tags</span>
            </label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={options.includeLinks}
                onChange={(e) =>
                  setOptions({ ...options, includeLinks: e.target.checked })
                }
              />
              <span>Include links</span>
            </label>
          </div>
        </article>
      </section>

      <section className="export-preview" aria-label="Export configuration">
        <header>
          <h2>Preview</h2>
          <p className="muted">Estimated export size and content summary</p>
        </header>
        <div className="preview-stats">
          <div className="preview-stat">
            <span className="preview-value">{boards?.length || 0}</span>
            <span className="preview-label">Boards</span>
          </div>
          <div className="preview-stat">
            <span className="preview-value">
              {options.includeArchived ? "All" : "Active only"}
            </span>
            <span className="preview-label">Cards</span>
          </div>
          <div className="preview-stat">
            <span className="preview-value">
              {options.format.toUpperCase()}
            </span>
            <span className="preview-label">Format</span>
          </div>
          <div className="preview-stat">
            <span className="preview-value">
              ~{Math.round((boards?.length || 1) * 50)} KB
            </span>
            <span className="preview-label">Est. Size</span>
          </div>
        </div>
      </section>

      <section className="export-action">
        <button
          className="primary full-width large"
          onClick={handleSubmit}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? (
            <>
              {" "}
              <Loader2 className="icon spin" /> Exporting...{" "}
            </>
          ) : (
            <>
              <Download className="icon" />
              Export {options.format.toUpperCase()}
            </>
          )}
        </button>
      </section>

      <section className="export-history" aria-label="Recent exports">
        <header>
          <h2>Recent Exports</h2>
        </header>
        <p className="muted center">
          Export history will appear here after your first export.
        </p>
      </section>
    </div>
  );
}

export default function ExportPage() {
  return (
    <QueryProvider>
      <ExportPageContent />
    </QueryProvider>
  );
}
