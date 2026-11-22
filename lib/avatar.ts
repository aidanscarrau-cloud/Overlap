import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareLogo } from "./logo";

/** Upload a profile picture into the person's own folder and return its public address. */
export async function uploadAvatar(supabase: SupabaseClient, userId: string, file: File) {
  const blob = await prepareLogo(file);
  const ext = blob.type === "image/webp" ? "webp" : "png";
  const name = `${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(`${userId}/${name}`, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? "Profile pictures aren't set up yet. Run update 32 in Supabase, then try again." : error.message);
  return supabase.storage.from("avatars").getPublicUrl(`${userId}/${name}`).data.publicUrl;
}

export async function removeAvatarFile(supabase: SupabaseClient, url: string | null | undefined) {
  const marker = "/storage/v1/object/public/avatars/";
  if (!url || !url.includes(marker)) return;
  await supabase.storage.from("avatars").remove([decodeURIComponent(url.split(marker)[1])]);
}
