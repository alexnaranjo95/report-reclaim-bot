import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Crumb {
  label: string;
  to?: string;
}

interface AccountHeaderProps {
  title: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}

export const AccountHeader: React.FC<AccountHeaderProps> = ({ title, breadcrumbs = [], actions, className }) => {
  const location = useLocation();
  const nav = [
    { label: "Dashboard", to: "/" },
    { label: "Credit Report", to: "/credit-reports" },
    { label: "Settings", to: "/settings" },
  ];

  const isActive = (to: string) => location.pathname === to;

  return (
    <header className={cn("sticky top-0 z-40 border-b bg-card/80 backdrop-blur-sm", className)} role="banner">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb" className="hidden md:block">
                  <ol className="flex items-center gap-2 text-sm text-muted-foreground">
                    {breadcrumbs.map((c, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {c.to ? (
                          <Link to={c.to} className="hover:text-foreground transition-colors">{c.label}</Link>
                        ) : (
                          <span>{c.label}</span>
                        )}
                        {i < breadcrumbs.length - 1 && <span className="opacity-50">/</span>}
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
            </div>
            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
        <div className="mt-3 flex items-center gap-1 overflow-x-auto">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive: active }) =>
                cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  active || isActive(n.to)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </div>
      </div>
    </header>
  );
};

export default AccountHeader;
