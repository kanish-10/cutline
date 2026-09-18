"use client";

import type { RepurposingLink } from "@cutline/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Edit, Loader2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { QueryProvider } from "@/components/query-provider";
import { api } from "@/lib/api";

const PLATFORMS = [
  "shorts",
  "reels",
  "tiktok",
  "threads",
  "newsletter",
  "blog",
  "linkedin",
  "custom",
] as const;

const STATUSES = ["planned", "in_progress", "published", "archived"] as const;

interface RepurposingFormData {
  parentCardId: string;
  childCardId: string;
  platform:
    | "shorts"
    | "reels"
    | "tiktok"
    | "threads"
    | "newsletter"
    | "blog"
    | "linkedin"
    | "custom";
  customPlatform?: string;
  status: "planned" | "in_progress" | "published" | "archived";
}

function RepurposingPageContent() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RepurposingLink | null>(null);
  const [formData, setFormData] = useState<RepurposingFormData>({
    parentCardId: "",
    childCardId: "",
    platform: "shorts",
    status: "planned",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["repurposing"],
    queryFn: () => api.getRepurposing(),
  });

  const createMutation = useMutation({
    mutationFn: api.createRepurposing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repurposing"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<RepurposingLink>;
    }) => api.updateRepurposing(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repurposing"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateRepurposing(id, { status: "archived" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["repurposing"] }),
  });

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      parentCardId: "",
      childCardId: "",
      platform: "shorts",
      status: "planned",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: RepurposingLink) => {
    setEditingItem(item);
    setFormData({
      parentCardId: item.parentCardId,
      childCardId: item.childCardId,
      platform: item.platform,
      customPlatform: item.customPlatform || "",
      status: item.status,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({
      parentCardId: "",
      childCardId: "",
      platform: "shorts",
      status: "planned",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, input: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) return <RepurposingSkeleton />;

  return (
    <div className="repurposing-page">
      <header className="page-header">
        <div>
          <h1>Content Repurposing</h1>
          <p className="muted">
            Track parent content and its derivative pieces across platforms
          </p>
        </div>
        <button className="primary" onClick={openCreateModal}>
          <Plus className="icon" /> Link Content
        </button>
      </header>

      {items && items.length === 0 ? (
        <section className="empty-state">
          <div className="empty-icon">🔄</div>
          <h2>No repurposing links yet</h2>
          <p>
            Link your long-form content to Shorts, Reels, Threads, and more to
            track repurposing workflow.
          </p>
          <button className="primary" onClick={openCreateModal}>
            <Plus className="icon" /> Create First Link
          </button>
        </section>
      ) : (
        <section
          className="repurposing-table-container"
          aria-label="Repurposing links"
        >
          <table className="repurposing-table">
            <thead>
              <tr>
                <th>Parent Content</th>
                <th>Derivative</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Created</th>
                <th>Published</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="content-cell">
                    <span className="content-title">
                      Card {item.parentCardId.slice(0, 8)}
                    </span>
                    <span className="content-id">
                      #{item.parentCardId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="content-cell">
                    <span className="content-title">
                      Card {item.childCardId.slice(0, 8)}
                    </span>
                    <span className="content-id">
                      #{item.childCardId.slice(0, 8)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`platform-badge platform-${item.platform}`}
                    >
                      {item.platform === "custom" && item.customPlatform
                        ? item.customPlatform
                        : item.platform}
                    </span>
                  </td>
                  <td>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateMutation.mutate({
                          id: item.id,
                          input: {
                            status: e.target.value as
                              | "planned"
                              | "in_progress"
                              | "published"
                              | "archived",
                          },
                        })
                      }
                      className={`status-select status-${item.status}`}
                      disabled={updateMutation.isPending}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() +
                            s.slice(1).replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{format(new Date(item.createdAt), "MMM d, yyyy")}</td>
                  <td>
                    {item.publishedAt
                      ? format(new Date(item.publishedAt), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="icon-button"
                        onClick={() => openEditModal(item)}
                        disabled={updateMutation.isPending}
                        aria-label="Edit"
                      >
                        <Edit className="icon" />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => deleteMutation.mutate(item.id)}
                        disabled={deleteMutation.isPending}
                        aria-label="Archive"
                      >
                        <Trash2 className="icon" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{editingItem ? "Edit Link" : "Link Content"}</h2>
              <button
                className="icon-button"
                onClick={closeModal}
                aria-label="Close"
              >
                <X className="icon" />
              </button>
            </header>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-row">
                <label>
                  Parent Card ID
                  <input
                    type="text"
                    value={formData.parentCardId || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, parentCardId: e.target.value })
                    }
                    placeholder="UUID of parent content"
                    required
                  />
                </label>
                <label>
                  Child Card ID
                  <input
                    type="text"
                    value={formData.childCardId || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, childCardId: e.target.value })
                    }
                    placeholder="UUID of derivative content"
                    required
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Platform
                  <select
                    value={formData.platform || "shorts"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        platform: e.target.value as
                          | "shorts"
                          | "reels"
                          | "tiktok"
                          | "threads"
                          | "newsletter"
                          | "blog"
                          | "linkedin"
                          | "custom",
                      })
                    }
                    required
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() +
                          p.slice(1).replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={formData.status || "planned"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as
                          | "planned"
                          | "in_progress"
                          | "published"
                          | "archived",
                      })
                    }
                    required
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() +
                          s.slice(1).replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {formData.platform === "custom" && (
                <label>
                  Custom Platform Name
                  <input
                    type="text"
                    value={formData.customPlatform || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customPlatform: e.target.value,
                      })
                    }
                    placeholder="e.g., Twitter, Medium"
                  />
                </label>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={closeModal}
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="icon spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus className="icon" />
                      {editingItem ? "Update" : "Create"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RepurposingSkeleton() {
  return (
    <div className="repurposing-page">
      <header className="page-header">
        <div className="skeleton-text h1"></div>
        <button className="primary skeleton"></button>
      </header>
      <section className="repurposing-table-container">
        <table className="repurposing-table">
          <thead>
            <tr>
              <th>Parent</th>
              <th>Derivative</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Created</th>
              <th>Published</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => ( // biome-ignore lint/correctness/noArrayIndexKey: skeleton rows are static placeholders
              <tr key={`skeleton-${i}`} className="skeleton-row">
                <td className="skeleton-cell"></td>
                <td className="skeleton-cell"></td>
                <td className="skeleton-cell"></td>
                <td className="skeleton-cell"></td>
                <td className="skeleton-cell"></td>
                <td className="skeleton-cell"></td>
                <td className="skeleton-cell"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
export default function RepurposingPage() {
  return (
    <QueryProvider>
      <RepurposingPageContent />
    </QueryProvider>
  );
}
