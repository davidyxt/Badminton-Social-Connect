"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  Flag,
  Gamepad2,
  Images,
  LayoutDashboard,
  ScrollText,
  Scale,
  ShieldAlert,
  Trophy,
  UsersRound,
  Medal,
} from "lucide-react";
import type { ComponentType } from "react";
import { MINI_LEAGUES_ENABLED } from "@/lib/features";

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badgeKey?: "reports" | "disputes";
  children?: NavChild[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      {
        label: "Analytics",
        href: "/analytics",
        icon: ChartColumn,
        children: [
          { label: "Usage overview", href: "/analytics" },
          { label: "New users", href: "/analytics/new-users" },
          { label: "Reports received", href: "/analytics/reports-received" },
          ...(MINI_LEAGUES_ENABLED ? [{ label: "Mini League activity", href: "/analytics/mini-league-activity" }] : []),
          { label: "Games published", href: "/analytics/games-published" },
        ],
      },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Users", href: "/users", icon: UsersRound },
      MINI_LEAGUES_ENABLED
        ? {
            label: "Rankings",
            href: "/rankings/singles",
            icon: Medal,
            children: [
              { label: "Singles", href: "/rankings/singles" },
              { label: "Mini League", href: "/rankings/mini-league" },
            ],
          }
        : { label: "Rankings", href: "/rankings/singles", icon: Medal },
      ...(MINI_LEAGUES_ENABLED ? [{ label: "Mini Leagues", href: "/mini-leagues", icon: Trophy }] : []),
      { label: "Games & results", href: "/games", icon: Gamepad2 },
    ],
  },
  {
    label: "Safety",
    items: [
      { label: "Reports", href: "/reports", icon: Flag, badgeKey: "reports" },
      {
        label: "Moderation",
        href: "/moderation/game-posts",
        icon: ShieldAlert,
        children: [
          { label: "Game posts", href: "/moderation/game-posts" },
          ...(MINI_LEAGUES_ENABLED ? [{ label: "Mini Leagues", href: "/moderation/mini-leagues" }] : []),
          { label: "Deleted records", href: "/moderation/deleted" },
        ],
      },
      { label: "Disputes", href: "/disputes", icon: Scale, badgeKey: "disputes" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Content", href: "/content", icon: Images },
      { label: "Activity log", href: "/activity-log", icon: ScrollText },
    ],
  },
];

/** Every nav item, in sidebar order. */
export const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

const sectionOf = (href: string) => "/" + href.split("/")[1];

export function Sidebar({ badges, onNavigate }: { badges: Record<"reports" | "disputes", number>; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="mt-4 first:mt-1">
          <div className="mb-1 px-2.5 text-[11px] font-medium text-ink-faint">{section.label}</div>
          <ul className="space-y-px">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(sectionOf(item.href) + "/") || pathname === sectionOf(item.href);
              const Icon = item.icon;
              const badge = item.badgeKey ? badges[item.badgeKey] : 0;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active && !item.children ? "page" : undefined}
                    className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
                      active
                        ? "bg-sidebar-active font-medium text-ink ring-1 ring-line"
                        : "text-sidebar-text hover:bg-sidebar-hover hover:text-ink"
                    }`}
                  >
                    <Icon className={`size-4 shrink-0 ${active ? "text-ink-muted" : "text-ink-faint"}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span
                        className={`text-xs tabular-nums ${item.badgeKey === "reports" ? "font-medium text-accent" : "text-ink-faint"}`}
                        aria-label={`${badge} need attention`}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                  {item.children && active && (
                    <ul className="mt-px mb-1 ml-[1.0625rem] space-y-px border-l border-line pl-2.5">
                      {item.children.map((child) => {
                        const childActive = pathname === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={childActive ? "page" : undefined}
                              className={`flex h-7 items-center rounded-md px-2.5 text-[13px] ${
                                childActive ? "font-medium text-ink" : "text-ink-muted hover:bg-sidebar-hover hover:text-ink"
                              }`}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
