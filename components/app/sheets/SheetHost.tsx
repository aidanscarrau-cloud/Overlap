"use client";

import { useApp } from "../AppProvider";
import { SessionSheet } from "./SessionSheet";
import { PlayerSheet } from "./PlayerSheet";
import { DrillView, DrillEdit } from "./DrillSheets";
import { TeamSheet } from "./TeamSheet";
import { EvaluationSheet, GoalSheet } from "../idp/IdpSheets";

export function SheetHost() {
  const { sheet } = useApp();
  if (!sheet) return null;
  // key forces a fresh draft each time a different item opens
  switch (sheet.kind) {
    case "session":
      return <SessionSheet key={"s" + sheet.id + (sheet.date ?? "") + (sheet.copyFrom ?? "")} id={sheet.id} date={sheet.date} copyFrom={sheet.copyFrom} />;
    case "player":
      return <PlayerSheet key={"p" + sheet.id} id={sheet.id} />;
    case "drill":
      return <DrillView key={"d" + sheet.id} id={sheet.id} />;
    case "drill-edit":
      return <DrillEdit key={"de" + sheet.id} id={sheet.id} />;
    case "team":
      return <TeamSheet key={"t" + sheet.id} id={sheet.id} />;
    case "evaluation":
      return <EvaluationSheet key={"ev" + sheet.playerId + sheet.id} playerId={sheet.playerId} id={sheet.id} />;
    case "goal":
      return <GoalSheet key={"g" + sheet.playerId + sheet.id} playerId={sheet.playerId} id={sheet.id} />;
  }
}
