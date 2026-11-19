"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/lib/push-client";

/* "Get the app": put Overlap on your phone's home screen, step by step with pictures. Free, no app store. */

type Platform = "iphone" | "android" | "computer";
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detect(): Platform {
  if (isIos()) return "iphone";
  if (/android/i.test(navigator.userAgent)) return "android";
  return "computer";
}

export function GetApp({ clubName }: { clubName?: string | null }) {
  const [p, setP] = useState<Platform>("iphone");
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [notSafari, setNotSafari] = useState(false);
  useEffect(() => {
    setP(detect());
    setInstalled(isStandalone());
    setNotSafari(
      isIos() && /crios|fxios|edgios|opios|gsa\//i.test(navigator.userAgent),
    );
    const h = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    const done = () => setInstalled(true);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", h);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const r = await prompt.userChoice;
    if (r.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  const club = clubName || "your club";
  return (
    <div className="ga">
      <header className="ga-head">
        <span className="ga-kicker">
          Free · no app store needed · 30 seconds
        </span>
        <h1>Get the Overlap app</h1>
        <p>
          Put {club} on your home screen. It opens like any other app and sends
          you notifications for training changes, matches and team messages.
        </p>
      </header>

      {installed ? (
        <section className="ga-card ga-ok">
          <div className="ga-tick" aria-hidden="true">
            ✓
          </div>
          <h2>You&apos;re using the app</h2>
          <p>
            Next, turn on notifications so you don&apos;t miss a training
            change.
          </p>
          <a className="btn primary ga-big" href="/notifications">
            Turn on notifications
          </a>
        </section>
      ) : (
        <>
          <div className="seg ga-tabs" role="tablist" aria-label="Your phone">
            {(
              [
                ["iphone", "iPhone"],
                ["android", "Android"],
                ["computer", "Computer"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={p === k}
                onClick={() => setP(k)}
              >
                {l}
              </button>
            ))}
          </div>

          {p === "iphone" && (
            <ol className="ga-steps">
              {notSafari && (
                <li className="ga-warn">
                  <p>
                    <b>Open this page in Safari first.</b> Copy the address,
                    open Safari (the blue compass) and paste it in. Other
                    browsers on iPhone can&apos;t always add apps to the home
                    screen.
                  </p>
                </li>
              )}
              <Step
                n={1}
                title="Tap the Share button"
                text="At the bottom of Safari (on iPad it's at the top), tap the square with an arrow pointing up."
                pic={<IosShare />}
              />
              <Step
                n={2}
                title="Tap “Add to Home Screen”"
                text="Scroll down the list if you can't see it straight away."
                pic={<IosMenu />}
              />
              <Step
                n={3}
                title="Tap “Add”"
                text="It's in the top-right corner. You can keep the name Overlap."
                pic={<IosAdd />}
              />
              <Step
                n={4}
                title="Open Overlap from your home screen"
                text="Use the new icon from now on, not Safari. Sign in once, then allow notifications when asked."
                pic={<HomeIcon />}
              />
            </ol>
          )}

          {p === "android" && (
            <ol className="ga-steps">
              {prompt && (
                <li className="ga-quick">
                  <p>
                    <b>Quickest way:</b> press the button and then{" "}
                    <b>Install</b>.
                  </p>
                  <button className="btn primary ga-big" onClick={install}>
                    Install Overlap
                  </button>
                </li>
              )}
              <Step
                n={1}
                title="Open Chrome's menu"
                text="Tap the three dots ⋮ in the top-right corner of Chrome."
                pic={<AndroidMenu />}
              />
              <Step
                n={2}
                title="Tap “Install app” or “Add to Home screen”"
                text="The wording depends on your phone. Both do the same thing."
                pic={<AndroidItem />}
              />
              <Step
                n={3}
                title="Tap “Install”"
                text="Overlap is added to your home screen and app drawer."
                pic={<AndroidInstall />}
              />
              <Step
                n={4}
                title="Open Overlap from your home screen"
                text="Sign in once, then allow notifications when asked."
                pic={<HomeIcon />}
              />
            </ol>
          )}

          {p === "computer" && (
            <ol className="ga-steps">
              <li className="ga-step">
                <span className="ga-n">i</span>
                <div>
                  <b>On a phone?</b>
                  <p>
                    Open this page on your phone to get the app. Overlap on your
                    home screen is the easiest way for parents and players.
                  </p>
                </div>
              </li>
              <Step
                n={1}
                title="In Chrome or Edge, look at the address bar"
                text="On the right there's an install icon (a screen with a down arrow)."
                pic={<DesktopInstall />}
              />
              <Step
                n={2}
                title="Click it, then “Install”"
                text="Overlap opens in its own window and gets a shortcut on your computer. Or just bookmark this site."
              />
            </ol>
          )}
        </>
      )}

      <section className="ga-card ga-why">
        <h2>Why use the app?</h2>
        <ul>
          <li>Reply to training and matches in one tap</li>
          <li>Notifications when a session changes or is cancelled</li>
          <li>
            Team chat, schedule and your player&apos;s progress in one place
          </li>
          <li>Always up to date. It updates itself, nothing to download</li>
        </ul>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  text,
  pic,
}: {
  n: number;
  title: string;
  text: string;
  pic?: React.ReactNode;
}) {
  return (
    <li className="ga-step">
      <span className="ga-n">{n}</span>
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
      {pic && <div className="ga-pic">{pic}</div>}
    </li>
  );
}

/* ------------------------------------------------------------------ simple pictures of each screen */

const HL = "var(--accent, #f29130)";
const Phone = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 160 200" role="img" aria-hidden="true">
    <rect x="12" y="4" width="136" height="192" rx="20" fill="#101828" />
    <rect x="18" y="10" width="124" height="180" rx="15" fill="#f2f4f7" />
    {children}
  </svg>
);

function IosShare() {
  return (
    <Phone>
      <rect x="28" y="22" width="104" height="14" rx="7" fill="#fff" />
      <text x="80" y="32" textAnchor="middle" fontSize="7" fill="#667085">
        overlap…vercel.app
      </text>
      <rect x="28" y="46" width="104" height="44" rx="8" fill="#fff" />
      <rect x="28" y="96" width="104" height="30" rx="8" fill="#fff" />
      <rect x="18" y="160" width="124" height="30" fill="#fff" />
      <g fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
        <path d="M34 175l-4-4 4-4M46 167l4 4-4 4" />
        <path d="M104 167v12M110 177h-12" />
        <rect x="120" y="167" width="8" height="10" rx="1" />
      </g>
      <circle cx="80" cy="175" r="13" fill="none" stroke={HL} strokeWidth="3" />
      <g
        fill="none"
        stroke="#2563eb"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M75 172v8h10v-8" />
        <path d="M80 177v-11M76.5 169.5L80 166l3.5 3.5" />
      </g>
    </Phone>
  );
}
function IosMenu() {
  const rows = [
    "Copy",
    "Add to Reading List",
    "Add Bookmark",
    "Add to Home Screen",
    "Find on Page",
  ];
  return (
    <Phone>
      <rect x="18" y="60" width="124" height="130" rx="12" fill="#fff" />
      {rows.map((r, i) => (
        <g key={r}>
          <rect
            x="26"
            y={70 + i * 22}
            width="108"
            height="18"
            rx="5"
            fill={i === 3 ? "#fff4e5" : "#f6f7f9"}
            stroke={i === 3 ? HL : "none"}
            strokeWidth="2.5"
          />
          <text
            x="32"
            y={82 + i * 22}
            fontSize="7.5"
            fill="#101828"
            fontWeight={i === 3 ? 700 : 400}
          >
            {r}
          </text>
          {i === 3 && (
            <rect
              x="118"
              y={74 + i * 22}
              width="10"
              height="10"
              rx="2"
              fill="none"
              stroke="#101828"
              strokeWidth="1.3"
            />
          )}
          {i === 3 && (
            <path
              d={`M123 ${76 + i * 22}v6M120 ${79 + i * 22}h6`}
              stroke="#101828"
              strokeWidth="1.3"
            />
          )}
        </g>
      ))}
    </Phone>
  );
}
function IosAdd() {
  return (
    <Phone>
      <rect x="18" y="10" width="124" height="28" rx="0" fill="#fff" />
      <text x="28" y="28" fontSize="8" fill="#2563eb">
        Cancel
      </text>
      <text
        x="80"
        y="28"
        fontSize="8"
        fill="#101828"
        textAnchor="middle"
        fontWeight="700"
      >
        Add to Home
      </text>
      <rect
        x="112"
        y="18"
        width="24"
        height="14"
        rx="5"
        fill="#fff4e5"
        stroke={HL}
        strokeWidth="2.5"
      />
      <text
        x="124"
        y="28"
        fontSize="8"
        fill="#2563eb"
        textAnchor="middle"
        fontWeight="700"
      >
        Add
      </text>
      <rect x="28" y="48" width="104" height="40" rx="8" fill="#fff" />
      <rect x="34" y="54" width="28" height="28" rx="7" fill="#2d5bff" />
      <path
        d="M40 64c3 5 8 6 13 4M40 72c2-6 7-8 13-6"
        stroke="#fff"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <text x="70" y="66" fontSize="8" fill="#101828" fontWeight="700">
        Overlap
      </text>
      <text x="70" y="77" fontSize="6.5" fill="#667085">
        overlap…vercel.app
      </text>
    </Phone>
  );
}
function HomeIcon() {
  const apps = [0, 1, 2, 3, 4, 5, 6];
  return (
    <Phone>
      <rect x="18" y="10" width="124" height="180" rx="15" fill="#3b4a6b" />
      {apps.map((i) => (
        <rect
          key={i}
          x={30 + (i % 4) * 27}
          y={26 + Math.floor(i / 4) * 34}
          width="20"
          height="20"
          rx="5"
          fill="rgba(255,255,255,.35)"
        />
      ))}
      <g transform="translate(111 60)">
        <rect
          x="-3"
          y="-3"
          width="26"
          height="26"
          rx="8"
          fill="none"
          stroke={HL}
          strokeWidth="2.5"
        />
        <rect width="20" height="20" rx="5" fill="#2d5bff" />
        <path
          d="M4 7c2 4 6 5 10 3M4 14c2-5 6-6 10-5"
          stroke="#fff"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <text x="121" y="92" fontSize="6" fill="#fff" textAnchor="middle">
        Overlap
      </text>
    </Phone>
  );
}
function AndroidMenu() {
  return (
    <Phone>
      <rect x="18" y="10" width="124" height="26" fill="#fff" />
      <rect x="26" y="17" width="88" height="13" rx="6.5" fill="#f2f4f7" />
      <text x="34" y="26" fontSize="6.5" fill="#667085">
        overlap…vercel.app
      </text>
      <circle
        cx="129"
        cy="23"
        r="9"
        fill="#fff4e5"
        stroke={HL}
        strokeWidth="2.5"
      />
      {[19, 23, 27].map((y) => (
        <circle key={y} cx="129" cy={y} r="1.3" fill="#101828" />
      ))}
      <rect x="28" y="46" width="104" height="44" rx="8" fill="#fff" />
      <rect x="28" y="96" width="104" height="30" rx="8" fill="#fff" />
    </Phone>
  );
}
function AndroidItem() {
  const rows = [
    "New tab",
    "History",
    "Downloads",
    "Share…",
    "Install app",
    "Settings",
  ];
  return (
    <Phone>
      <rect x="58" y="14" width="80" height="140" rx="6" fill="#fff" />
      {rows.map((r, i) => (
        <g key={r}>
          {i === 4 && (
            <rect
              x="61"
              y={20 + i * 21}
              width="74"
              height="18"
              rx="4"
              fill="#fff4e5"
              stroke={HL}
              strokeWidth="2.5"
            />
          )}
          <text
            x="68"
            y={32 + i * 21}
            fontSize="7.5"
            fill="#101828"
            fontWeight={i === 4 ? 700 : 400}
          >
            {r}
          </text>
        </g>
      ))}
    </Phone>
  );
}
function AndroidInstall() {
  return (
    <Phone>
      <rect
        x="18"
        y="10"
        width="124"
        height="180"
        rx="15"
        fill="rgba(16,24,40,.35)"
      />
      <rect x="28" y="64" width="104" height="72" rx="10" fill="#fff" />
      <text x="38" y="82" fontSize="8.5" fill="#101828" fontWeight="700">
        Install app?
      </text>
      <rect x="38" y="90" width="16" height="16" rx="4" fill="#2d5bff" />
      <text x="60" y="101" fontSize="7.5" fill="#101828">
        Overlap
      </text>
      <text x="74" y="126" fontSize="7.5" fill="#2563eb">
        Cancel
      </text>
      <rect
        x="99"
        y="116"
        width="28"
        height="15"
        rx="5"
        fill="#fff4e5"
        stroke={HL}
        strokeWidth="2.5"
      />
      <text
        x="113"
        y="126"
        fontSize="7.5"
        fill="#2563eb"
        textAnchor="middle"
        fontWeight="700"
      >
        Install
      </text>
    </Phone>
  );
}
function DesktopInstall() {
  return (
    <svg viewBox="0 0 220 90" role="img" aria-hidden="true">
      <rect x="4" y="4" width="212" height="82" rx="10" fill="#101828" />
      <rect x="10" y="16" width="200" height="64" rx="4" fill="#f2f4f7" />
      <rect x="16" y="22" width="188" height="14" rx="7" fill="#fff" />
      <text x="24" y="32" fontSize="7" fill="#667085">
        overlap-three-pi.vercel.app
      </text>
      <circle
        cx="194"
        cy="29"
        r="9"
        fill="#fff4e5"
        stroke={HL}
        strokeWidth="2.5"
      />
      <rect
        x="189"
        y="24"
        width="10"
        height="7"
        rx="1"
        fill="none"
        stroke="#101828"
        strokeWidth="1.2"
      />
      <path
        d="M194 25.5v4M192.3 28l1.7 1.7 1.7-1.7M191 33.5h6"
        stroke="#101828"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}
