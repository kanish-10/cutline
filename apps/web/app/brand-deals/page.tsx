"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { QueryProvider } from "@/components/query-provider";
import { api } from "@/lib/api";

function BrandDealsPageContent() {
  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["brandDeals"],
    queryFn: () => api.getBrandDeals(),
  });

  if (isLoading) {
    return (
      <div className="brand-deals-page">
        <header className="page-header">
          <div className="skeleton-text h1"></div>
          <button type="button" className="primary skeleton"></button>
        </header>
      </div>
    );
  }

  return (
    <div className="brand-deals-page">
      <header className="page-header">
        <div>
          <h1>Brand Deals</h1>
          <p className="muted">
            Manage sponsorships, contracts, and deliverables
          </p>
        </div>
        <button type="button" className="primary">
          <Plus className="icon" /> New Deal
        </button>
      </header>
      <section className="deals-list" aria-label="Brand deals">
        {deals?.map((deal) => (
          <article key={deal.id} className="deal-card">
            <header className="deal-header">
              <div className="deal-main">
                <div className="deal-brand">
                  <span className="brand-name">{deal.brandName}</span>
                </div>
              </div>
            </header>
          </article>
        ))}
      </section>
    </div>
  );
}

export default function BrandDealsPage() {
  return (
    <QueryProvider>
      <div className="brand-deals-page">
        <header className="page-header">
          <h1>Brand Deals</h1>
        </header>
        <QueryProvider>
          <BrandDealsPageContent />
        </QueryProvider>
      </div>
    </QueryProvider>
  );
}
