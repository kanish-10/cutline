"use client";

import type { AnalyticsSnapshot } from "@cutline/shared";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart, Clock, Target, TrendingUp, Trophy, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

function DashboardPageContent() {
  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.getDashboard(),
  });
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">(
    "month",
  );

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <div className="error">Failed to load analytics</div>;
  if (!analytics) return <div className="center-state">No data available</div>;

  const stats = [
    {
      label: "Ideas Captured",
      value: analytics.cardsCreated,
      icon: Zap,
      color: "var(--accent)",
      trend: "+12%",
    },
    {
      label: "Published",
      value: analytics.cardsPublished,
      icon: TrendingUp,
      color: "var(--success)",
      trend: "+8%",
    },
    {
      label: "Completion Rate",
      value: `${Math.round(analytics.completionRate * 100)}%`,
      icon: Target,
      color: "var(--accent)",
      trend: "+5%",
    },
    {
      label: "Avg. Time to Publish",
      value: `${analytics.averageTimeToPublish.toFixed(1)} days`,
      icon: Clock,
      color: "var(--muted)",
      trend: "-2 days",
    },
    {
      label: "Velocity",
      value: analytics.velocity.toString(),
      icon: BarChart,
      color: "var(--accent)",
      trend: "+15%",
    },
    {
      label: "Repurposed",
      value: analytics.repurposingCount.toString(),
      icon: Trophy,
      color: "var(--accent)",
      trend: "+3%",
    },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Analytics Dashboard</h1>
          <p className="muted">
            Track your content velocity and optimize your workflow
          </p>
        </div>
        <div className="period-selector">
          {["week", "month", "quarter", "year"].map((p) => (
            <button
              key={p}
              className={`period-btn ${period === p ? "active" : ""}`}
              onClick={() => setPeriod(p as typeof period)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <section className="stats-grid" aria-label="Key metrics">
        {stats.map((stat) => (
          <article key={stat.label} className="stat-card">
            <div
              className="stat-icon"
              style={{
                background: `color-mix(in srgb, ${stat.color} 15%, transparent)`,
              }}
            >
              <stat.icon className="icon" style={{ color: stat.color }} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-trend" style={{ color: stat.color }}>
                {stat.trend}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="charts-grid" aria-label="Charts">
        <article className="chart-card">
          <header>
            <h2>Stage Bottlenecks</h2>
            <p className="muted">Cards waiting in each stage</p>
          </header>
          <div className="bottleneck-chart">
            {Object.entries(analytics.stageBottlenecks).map(
              ([stage, count]) => (
                <div key={stage} className="bottleneck-bar">
                  <span className="bottleneck-label">{stage}</span>
                  <div className="bottleneck-track">
                    <div
                      className="bottleneck-fill"
                      style={{
                        width: `${Math.min((count / Math.max(...Object.values(analytics.stageBottlenecks), 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <span className="bottleneck-count">{count}</span>
                </div>
              ),
            )}
          </div>
        </article>

        <article className="chart-card">
          <header>
            <h2>Top Tags</h2>
            <p className="muted">Most used tags across your content</p>
          </header>
          <div className="tags-cloud">
            {analytics.topTags.length > 0 ? (
              analytics.topTags.map(({ tag, count }) => (
                <span
                  key={tag}
                  className="tag-cloud-item"
                  style={{ fontSize: `${12 + count * 2}px` }}
                >
                  {tag} <span className="tag-count">({count})</span>
                </span>
              ))
            ) : (
              <p className="muted center">No tags yet</p>
            )}
          </div>
        </article>
      </section>

      <section className="insights-card" aria-label="Insights">
        <header>
          <h2>Insights</h2>
          <p className="muted">AI-powered recommendations for your workflow</p>
        </header>
        <ul className="insights-list">
          <li className="insight">
            <div className="insight-icon">💡</div>
            <div>
              <strong>Stage bottleneck detected</strong>
              <p>
                {
                  Object.entries(analytics.stageBottlenecks).sort(
                    (a, b) => b[1] - a[1],
                  )[0]?.[0]
                }{" "}
                has the most cards. Consider focusing there.
              </p>
            </div>
          </li>
          <li className="insight">
            <div className="insight-icon">🔄</div>
            <div>
              <strong>Repurposing opportunity</strong>
              <p>
                You have {analytics.repurposingCount} repurposed pieces. Create
                Shorts/Reels from your long-form content to grow faster.
              </p>
            </div>
          </li>
          <li className="insight">
            <div className="insight-icon">📈</div>
            <div>
              <strong>Velocity trend</strong>
              <p>
                Your velocity is {analytics.velocity} cards/month. At this rate,
                you'll publish {analytics.velocity * 12} pieces this year.
              </p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="skeleton-text h1"></div>
        <div className="skeleton-text"></div>
      </header>
      <section className="stats-grid">
        {[...Array(6)].map((_, i) => (
          <article key={i} className="stat-card skeleton"></article>
        ))}
      </section>
      <section className="charts-grid">
        <article className="chart-card skeleton"></article>
        <article className="chart-card skeleton"></article>
      </section>
      <section className="insights-card skeleton"></section>
    </div>
  );
}

import { QueryProvider } from "@/components/query-provider";

export default function DashboardPage() {
  return (
    <QueryProvider>
      <DashboardPageContent />
    </QueryProvider>
  );
}
