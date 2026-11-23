import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages and files that work without signing in. The daily job checks its own secret.
const PUBLIC_PATHS = ["/login", "/auth", "/api/cron", "/api/calendar", "/api/match-video/callback", "/t/", "/api/trials/public", "/get-app", "/welcome", "/api/contact", "/help", "/privacy"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Without Supabase settings nothing can work: explain what to add.
    if (request.nextUrl.pathname === "/setup") return response;
    const setup = request.nextUrl.clone();
    setup.pathname = "/setup";
    setup.search = "";
    return NextResponse.redirect(setup);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() checks the signed session token locally (no network call on projects using
  // Supabase's JWT signing keys); it falls back to asking Supabase on older projects.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const path = request.nextUrl.pathname;
  // The main address is the public front page for everyone; the club app lives at /home.
  if (path === "/") {
    const welcome = request.nextUrl.clone();
    welcome.pathname = "/welcome";
    return NextResponse.rewrite(welcome);
  }
  // Already signed in: the sign-in page goes straight to the club.
  if (user && path === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const to = request.nextUrl.clone();
    to.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0] : "/home";
    to.search = next && next.includes("?") ? next.slice(next.indexOf("?")) : "";
    return NextResponse.redirect(to);
  }
  if (!user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    if (path !== "/home") login.searchParams.set("next", path + request.nextUrl.search);
    // Invite links are mostly for people who don't have an account yet.
    if (path.startsWith("/join/")) login.searchParams.set("mode", "signup");
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
