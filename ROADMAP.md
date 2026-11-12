# Overlap roadmap

Plan: build one feature per day, fully (database + rules + screens + tests), then publish and sell to other clubs.

## Done so far

- Logins (email/password, reset), clubs, invite codes and links, private-to-one-club switch
- Roles (admin, coach, player, parent) with team-scoped access and per-role permission switches
- Squads, players in several teams, parents with several children, availability and notes
- Session planner, drill library with pitch diagram designer, attendance, training replies (Yes/No)
- Announcements (club or team, pinned, clickable web/email/street-address links)
- Training load across all of a player's teams with a high-load flag
- Club logo and team badges, sample data and a one-click way to remove it

Database changes live in `supabase/migrations/` (0001 to 0009 so far). Each new feature adds the next numbered file, which is run once in the Supabase SQL Editor.

## Competition

Main competitor: XPS Network (academy and pro focus, "book a demo" sales). Their five selling points and our answer:

| Their pitch | Our answer |
|---|---|
| One centralised system | Finish this roadmap so a club needs no other app |
| IDPs made easy | IDPs that pull evidence automatically from attendance, training load and match stats |
| Coach development + insight into what coaches deliver | Planned vs delivered sessions, minutes per topic against a club curriculum, coach observations and development goals |
| One communication flow, everyone notified | Push + email notifications, reply reminders, then team chat |
| Departments connected (Medical, S&C, Technical, Admin) | Staff roles (Medical, S&C, Technical Director) with their own private areas |

Where we win: self-serve sign-up and simple public pricing (free tier for small grassroots clubs), built for parents (multiple children, players in several teams, one-tap replies), an AI assistant (Claude) for session plans, IDP summaries and risk spotting, and phone-first (installable web app). Build our own look and wording; never copy theirs.

## Build order (one per day)

| Day | Feature | Scope |
|---|---|---|
| 1 ✅ | **IDPs & goals** | Player evaluations (Technical, Tactical, Physical, Psychological, Social) over time, strengths, areas to improve, goals with target dates and status, coach comments, evidence from attendance and training load; player/parent view. |
| 2 ✅ | **Notifications** | Installable web app (home-screen icon, opens full screen) with push notifications and an in-app inbox: new, moved or cancelled sessions, announcements, new reviews and goals, and an evening-before reminder to anyone who hasn't replied. Per-person settings and per-device on/off. Email copies (every time, only without phone push, or never). |
| 3 ✅ | **Head & assistant coaches** | Roles are Club admin, Head coach, Assistant coach, Player and Parent. Assistants help run their teams (sessions, attendance, drills) with fewer switches on by default; head coaches can invite assistants to their own teams. Separate physio/S&C/technical director roles dropped at the club's request. |
| 4 | **Injury management** | Injury records (body area, type, date, severity, expected return, notes), automatic availability, return-to-play stages, history and reports. Medical-only details. |
| 5 | **Fixtures, matches & team statistics** | Matches (opponent, home/away, kick-off, venue), squad selection, line-ups, results, goals/assists/minutes/cards, season stats per player and team. |
| 6 | **Strength & conditioning tests** | Test library (sprint, jumps, 1RM, beep test, custom), results entry, relative strength, progress charts, squad comparisons and benchmarks. |
| 7 | **Coach development & delivery insights** | Club curriculum (themes per age group), planned vs delivered sessions, minutes per theme per coach and team, coach observations, coach goals and qualifications. |
| 8 ✅ | **Player progression dashboard** | One page per player (Progress report): attendance, typical training week, development rating and goals as tiles; weekly/monthly training minutes, a session-by-session attendance strip, overall and per-area rating trends; 3/6/12 months or all time; print/save as PDF and CSV download. Players and parents see their own. Injuries, tests and match stats join it when Days 4–6 are built. |
| 9 | **AI assistant** | Generate session plans from the drill library, draft IDP summaries, flag at-risk players from training load and injury history. |
| 10 ✅ | **Calendar & repeating sessions** | Month calendar on Sessions (phone: dots + day list); repeating sessions (weekly / fortnightly until a date) with one summary notification; edit or delete "this and later"; duplicate a session; private calendar links for iPhone/Google calendars that keep themselves up to date. |
| 11 | **Messages / chat** | Team chats and direct messages with role rules, unread counts, notifications. |
| 12 | **Video analysis** | Upload clips, tag moments, link to players/sessions/matches, share. Needs paid storage. |

### Maybe later

- **Wellness & readiness forms**: daily check-ins (sleep, soreness, mood) and post-session effort. Skipped for now; revisit if clubs ask for it.

## Before selling (checklist)

- **Name & brand**: check the "Overlap" name/trademark and domain availability in your target countries; buy a domain.
- **Opening to other clubs**: `update public.app_settings set allow_new_clubs = true where id = 1;` plus a sign-up page and an owner/super-admin view.
- **Billing**: subscriptions per club (e.g. Stripe), free trial, plan limits, cancel/export.
- **Legal**: privacy policy and terms; children's data needs parental consent and care under the Australian Privacy Act (and GDPR if selling to Europe); data deletion and export on request.
- **Email**: custom SMTP (Resend with your domain) and branded emails (templates in `supabase/email-templates/`).
- **Reliability**: Supabase Pro plan (daily backups, no pausing), error monitoring, uptime checks.
- **Mobile**: installable web app (PWA) first; App Store / Google Play later if needed.
- **Support & onboarding**: help pages, demo club, import players from a spreadsheet.
