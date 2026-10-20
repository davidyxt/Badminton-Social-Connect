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

export const NAV: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Users", href: "/users", icon: UsersRound },
  { label: "Reports", href: "/reports", icon: Flag, badgeKey: "reports" },
  {
    label: "Moderation",
    href: "/moderation/game-posts",
    icon: ShieldAlert,
    children: [
      { label: "Game posts", href: "/moderation/game-posts" },
      { label: "Mini Leagues", href: "/moderation/mini-leagues" },
      { label: "Deleted records", href: "/moderation/deleted" },
    ],
  },
  { label: "Mini Leagues", href: "/mini-leagues", icon: Trophy },
  { label: "Games & results", href: "/games", icon: Gamepad2 },
  {
    label: "Rankings",
    href: "/rankings/singles",
    icon: Medal,
    children: [
      { label: "Singles", href: "/rankings/singles" },
      { label: "Mini League", href: "/rankings/mini-league" },
    ],
  },
  { label: "Disputes", href: "/disputes", icon: Scale, badgeKey: "disputes" },
  { label: "Content", href: "/content", icon: Images },
  { label: "Activity log", href: "/activity-log", icon: ScrollText },
  {
    label: "Analytics",
    href: "/analytics",
    icon: ChartColumn,
    children: [
      { label: "Usage overview", href: "/analytics" },
      { label: "New users", href: "/analytics/new-users" },
      { label: "Reports received", href: "/analytics/reports-received" },
      { label: "Mini League activity", href: "/analytics/mini-league-activity" },
      { label: "Games published", href: "/analytics/games-published" },
    ],
  },
];

const sectionOf = (href: string) => "/" + href.split("/")[1];

export function Sidebar({ badges, onNavigate }: { badges: Record<"reports" | "disputes", number>; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(sectionOf(item.href) + "/") || pathname === sectionOf(item.href);
          const Icon = item.icon;
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active && !item.children ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-sidebar-active text-white" : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                }`}
              >
                <Icon className="size-4.5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white tabular-nums" aria-label={`${badge} need attention`}>
                    {badge}
                  </span>
                )}
              </Link>
              {item.children && active && (
                <ul className="mt-0.5 mb-1 ml-[1.375rem] space-y-0.5 border-l border-white/10 pl-3">
                  {item.children.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={onNavigate}
                          aria-current={childActive ? "page" : undefined}
                          className={`block rounded-md px-2.5 py-1.5 text-sm ${childActive ? "text-white" : "text-sidebar-text/80 hover:text-white"}`}
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
    </nav>
  );
}
