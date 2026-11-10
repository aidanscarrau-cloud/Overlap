"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayIso } from "@/lib/format";
import type { ClubData, Drill, Player, Reply, Session, Team } from "@/lib/types";
import type { Perm } from "@/lib/permissions";

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
  isAdmin: boolean;
  /** Does this person's role have the switch on? */
  can: (perm: Perm) => boolean;
  /** Is this one of the teams they work with? */
  manages: (teamId?: string | null) => boolean;
  /** Switch on AND their own team: what the database requires to change team data. */
  canDo: (perm: Perm, teamId?: string | null) => boolean;
  drillMap: Map<string, Drill>;
  squad: (teamId?: string) => Player[];
  sessionsOf: (teamId?: string) => Session[];
  attendedSet: (sessionId: string) => Set<string>;
  /** Replies for a session, by player id. */
  repliesFor: (sessionId: string) => Map<string, Reply>;
  /** Players this person answers for (their own record, or their children). */
  myPlayers: Player[];
  /** First name, or full name if two of this person's players share a first name. */
  kidName: (p: Player) => string;
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
  const [teamId, setTeamId] = useState<string | null>(initialTeam);
  const team = data.teams.find((t) => t.id === teamId) ?? data.teams.find((t) => data.myTeamIds.includes(t.id)) ?? data.teams[0] ?? null;

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

  const replyMap = useMemo(() => {
    const m = new Map<string, Map<string, Reply>>();
    data.replies.forEach((r) => {
      if (!m.has(r.session_id)) m.set(r.session_id, new Map());
      m.get(r.session_id)!.set(r.player_id, r);
    });
    return m;
  }, [data.replies]);
  const myPlayers = useMemo(() => data.players.filter((p) => data.me?.player_ids.includes(p.id)), [data.players, data.me]);

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
    isAdmin: data.role === "admin",
    can: (perm) => data.perms[perm],
    manages: (tid) => !!tid && data.myTeamIds.includes(tid),
    canDo: (perm, tid) => data.perms[perm] && !!tid && data.myTeamIds.includes(tid),
    drillMap,
    squad,
    sessionsOf,
    attendedSet,
    repliesFor: (sid) => replyMap.get(sid) ?? new Map(),
    myPlayers,
    kidName: (p) => {
      const f = p.full_name.split(" ")[0];
      return myPlayers.filter((x) => x.full_name.split(" ")[0] === f).length > 1 ? p.full_name : f;
    },
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
