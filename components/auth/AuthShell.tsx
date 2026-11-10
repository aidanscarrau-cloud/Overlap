import { PitchLines } from "@/components/ui";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-art">
        <PitchLines />
        <div className="brand">
          <svg aria-hidden="true">
            <use href="#logo" />
          </svg>
          <b>Overlap</b>
        </div>
        <div>
          <h1>Run your club from the touchline</h1>
          <p>Plan training, manage every squad and keep players and parents in the loop.</p>
          <ul>
            <li>Session planner with a drill library and pitch diagrams</li>
            <li>Squads, availability and attendance for every team</li>
            <li>Roles for admins, coaches, players and parents</li>
          </ul>
        </div>
        <span style={{ fontSize: 13, color: "var(--on-navy-muted)" }}>Overlap club hub</span>
      </section>
      <main className="auth-main">{children}</main>
    </div>
  );
}
