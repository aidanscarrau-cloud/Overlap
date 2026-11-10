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

## Build order (one per day)

| Day | Feature | Scope |
|---|---|---|
| 1 | **Wellness & readiness forms** | Daily check-in (sleep, soreness, mood, energy, stress) and post-session effort (RPE × minutes = session load). Readiness score per player and team, red flags, trends. Coach-configurable questions. Reminders on Overview. |
| 2 | **IDPs & goals** | Player evaluation ratings (Technical, Tactical, Physical, Psychological, Social) over time, strengths, areas to improve, goals with target dates and status, coach comments; player/parent view. |
| 3 | **Fixtures, matches & team statistics** | Matches (opponent, home/away, kick-off, venue), squad selection and availability, line-ups, results, goals/assists/minutes/cards, season stats per player and team. |
| 4 | **Injury management** | Injury records (body area, type, date, severity, expected return, notes), automatic availability, return-to-play stages, injury history and reports. |
| 5 | **Strength & conditioning tests** | Test library (sprint, jumps, 1RM, beep test, custom), results entry, relative strength, progress charts, squad comparisons and benchmarks. |
| 6 | **Player progression dashboard** | One page per player: readiness, load, tests, IDP ratings, attendance and match stats as charts over time; printable/exportable report. |
| 7 | **Calendar & repeating sessions** | Month/week calendar of training and matches, repeating sessions, copy a session or week. |
| 8 | **Messages / chat** | Team chats and direct messages with role rules, unread counts, notifications. |
| 9 | **Video analysis** | Upload clips, tag moments, link to players/sessions/matches, share. Needs paid storage. |

## Before selling (checklist)

- **Name & brand**: check the "Overlap" name/trademark and domain availability in your target countries; buy a domain.
- **Opening to other clubs**: `update public.app_settings set allow_new_clubs = true where id = 1;` plus a sign-up page and an owner/super-admin view.
- **Billing**: subscriptions per club (e.g. Stripe), free trial, plan limits, cancel/export.
- **Legal**: privacy policy and terms; children's data needs parental consent and care under the Australian Privacy Act (and GDPR if selling to Europe); data deletion and export on request.
- **Email**: custom SMTP (Resend with your domain) and branded emails (templates in `supabase/email-templates/`).
- **Reliability**: Supabase Pro plan (daily backups, no pausing), error monitoring, uptime checks.
- **Mobile**: installable web app (PWA) first; App Store / Google Play later if needed.
- **Support & onboarding**: help pages, demo club, import players from a spreadsheet.
