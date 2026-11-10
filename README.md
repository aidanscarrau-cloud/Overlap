# Overlap

A football club hub: squads, session planning, a drill library with a pitch diagram designer, and logins with roles for club admins, coaches, players and parents.

Built with Next.js (App Router) and Supabase (Postgres, Auth and row level security). Deploys to Vercel.

## Roles

| Role | Can do |
| --- | --- |
| Club admin | Everything: rename the club, manage teams, change member roles, invite anyone |
| Coach | Manage players, sessions, attendance and drills; invite players and parents |
| Player | See the club's squads, sessions and drills; update their own availability |
| Parent | Same as a player, for their linked child |

The rules live in the database (`supabase/migrations/0001_init.sql`), so they hold even if someone calls the API directly.

## Set up

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (the free plan is fine).
2. Open **SQL Editor** and run each file in `supabase/migrations/` in order: paste the file's contents (not its name), click **Run**, then do the next one. They're safe to run again.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.
4. Open **Authentication → URL Configuration**:
   - Set **Site URL** to your live address (for example `https://overlap-yourname.vercel.app`, once you have it).
   - Add `http://localhost:3000/**` and `https://*.vercel.app/**` to **Redirect URLs**.

Supabase sends a confirmation email when someone signs up. Its built-in email service only sends a few emails per hour; before inviting a whole club, add your own SMTP provider under **Authentication → Emails → SMTP settings**.

### 2. Run it on your computer (optional)

```bash
npm install
cp .env.example .env.local   # then paste your Supabase URL and key
npm run dev
```

Open http://localhost:3000, create an account, then **Start a club**. Tick "Add sample teams…" to get example data.

### 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. At [vercel.com/new](https://vercel.com/new), import the repository. Vercel detects Next.js automatically.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Click **Deploy**. When it finishes, copy your `.vercel.app` address into Supabase's **Site URL** (step 1.4).

## Inviting people

On **Club & members**, create an invite code. Choose the role, the team and, for players and parents, which player it's for. Send the person the code or its link (`/join/CODE`). They create an account and join with that role. Codes last 14 days.

## Project layout

```
app/                 routes (login, onboarding, join links, and the app pages under (app)/)
components/app/      app shell, pages, slide-in editors and the drill designer
lib/                 Supabase clients, data loading, types, helpers, sample data
supabase/migrations/ database schema and security rules
```
