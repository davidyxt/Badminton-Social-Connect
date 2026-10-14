import type { MockDatabase } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date (YYYY-MM-DD), matching the date inputs the Activity log filters with. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date and time (YYYY-MM-DD HH:mm, 24-hour) in the viewer's timezone; sorts as text. */
export function localDateTime(iso: string): string {
  const d = new Date(iso);
  return `${localDay(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Resolves a log target to a label + link, or nulls when the record no longer exists. */
export function resolveTarget(db: MockDatabase, type: string, id: string): { label: string | null; href: string | null } {
  switch (type) {
    case "player": {
      const p = db.players.find((x) => x.player_id === id);
      return p ? { label: p.display_name, href: `/users/${id}` } : { label: null, href: null };
    }
    case "report": {
      const r = db.reports.find((x) => x.report_id === id);
      return r ? { label: r.reason, href: `/reports/${id}` } : { label: null, href: null };
    }
    case "mini_league": {
      const l = db.mini_leagues.find((x) => x.league_id === id);
      return l ? { label: l.name, href: `/mini-leagues/${id}` } : { label: null, href: null };
    }
    case "game_post": {
      const g = db.game_posts.find((x) => x.post_id === id);
      return g ? { label: g.title, href: `/moderation/game-posts?post=${id}` } : { label: null, href: null };
    }
    case "dispute": {
      const d = db.disputes.find((x) => x.dispute_id === id);
      return d ? { label: id, href: `/disputes/${id}` } : { label: null, href: null };
    }
    case "admin_post": {
      const a = db.admin_posts.find((x) => x.admin_post_id === id);
      return a ? { label: a.title, href: "/content" } : { label: null, href: null };
    }
    default:
      return { label: null, href: null };
  }
}
