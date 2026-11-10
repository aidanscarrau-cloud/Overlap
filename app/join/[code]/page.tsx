import { redirect } from "next/navigation";

// Invite links look like /join/ABCD2345. Signed-out visitors are sent to sign in first by the middleware.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/onboarding?code=${encodeURIComponent(code.toUpperCase())}`);
}
