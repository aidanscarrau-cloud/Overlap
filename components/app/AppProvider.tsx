"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayIso } from "@/lib/format";
import type { ClubData, Drill, Player, Session, Team } from "@/lib/types";

export type Sheet =
  | { kind: "session"; id: string | null }
  | { kind: "player"; id: string | null }
  | { kind: "drill"; id: string }
  | { kind: "drill-edit"; id: string | null }
  | { kind: "team"; id: string | null }
  | null;

type Ctx = {
  data: ClubData;
  team: Team | null;
  setTeam: (id: string) => void;
  canEdit: boolean;
  isAdmin: boolean;
  drillMap: Map<string, Drill>;
  squad: (teamId?: string) => Player[];
  sessionsOf: (teamId?: string) => Session[];
  attendedSet: (sessionId: string) => Set<string>;
  playerRate: (p: Player) => number | null;
  sheet: Sheet;
  open: (s: Sheet) => void;
  close: () => void;
  toast: (msg: string) => void;
  supabase: ReturnType<typeof createClient>;
  refresh: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
};

export function AppProvider({ data, initialTeam, children }: { data: ClubData; initialTeam: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [teamId, setTeamId] = useState<string | null>(initialTeam ?? data.me?.team_id ?? null);
  const team = data.teams.find((t) => t.id === teamId) ?? data.teams.find((t) => t.id === data.me?.team_id) ?? data.teams[0] ?? null;

  const setTeam = useCallback((id: string) => {
    setTeamId(id);
    document.cookie = `overlap-team=${id}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const drillMap = useMemo(() => new Map(data.drills.map((d) => [d.id, d])), [data.drills]);
  const attendanceMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    data.attendance.forEach((a) => {
      if (!m.has(a.session_id)) m.set(a.session_id, new Set());
      m.get(a.session_id)!.add(a.player_id);
    });
    return m;
  }, [data.attendance]);

  const squad = useCallback(
    (tid?: string) =>
      data.players.filter((p) => p.team_id === (tid ?? team?.id)).sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999)),
    [data.players, team],
  );
  const sessionsOf = useCallback(
    (tid?: string) =>
      data.sessions.filter((s) => s.team_id === (tid ?? team?.id)).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)),
    [data.sessions, team],
  );
  const attendedSet = useCallback((sid: string) => attendanceMap.get(sid) ?? new Set<string>(), [attendanceMap]);
  const playerRate = useCallback(
    (p: Player) => {
      const past = data.sessions.filter((s) => s.team_id === p.team_id && s.date < todayIso());
      if (!past.length) return null;
      return Math.round((100 * past.filter((s) => attendanceMap.get(s.id)?.has(p.id)).length) / past.length);
    },
    [data.sessions, attendanceMap],
  );

  const [sheet, setSheet] = useState<Sheet>(null);
  const [toastMsg, setToastMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(""), 2400);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sheet ? "hidden" : "";
  }, [sheet]);

  const value: Ctx = {
    data,
    team,
    setTeam,
    canEdit: data.role === "admin" || data.role === "coach",
    isAdmin: data.role === "admin",
    drillMap,
    squad,
    sessionsOf,
    attendedSet,
    playerRate,
    sheet,
    open: setSheet,
    close: () => setSheet(null),
    toast,
    supabase,
    refresh: () => router.refresh(),
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </AppCtx.Provider>
  );
}
