import type { SupabaseClient } from "@supabase/supabase-js";

const MAX = 512;

/** Load any image the browser can read (PNG, JPG, WebP, GIF, SVG…) and redraw it as a small square-fit image. */
export async function prepareLogo(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file, such as a PNG or JPG.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is over 15 MB. Choose a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That image couldn't be opened. Try a PNG or JPG."));
      i.src = url;
    });
    const w = img.naturalWidth || MAX;
    const h = img.naturalHeight || MAX;
    const scale = Math.min(1, MAX / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("That image couldn't be processed. Try a PNG or JPG.");
    return blob; // Browsers that can't make WebP return PNG instead; blob.type says which.
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload a logo for the club or one of its teams and return its public address. */
export async function uploadLogo(supabase: SupabaseClient, clubId: string, kind: string, file: File) {
  const blob = await prepareLogo(file);
  const ext = blob.type === "image/webp" ? "webp" : "png";
  const path = `${clubId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(friendlyUploadError(error.message));
  return supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
}

/** Delete a previously uploaded logo file (ignored if it isn't one of ours). */
export async function removeLogoFile(supabase: SupabaseClient, url: string | null | undefined) {
  const marker = "/storage/v1/object/public/logos/";
  if (!url || !url.includes(marker)) return;
  await supabase.storage.from("logos").remove([decodeURIComponent(url.split(marker)[1])]);
}

function friendlyUploadError(msg: string) {
  if (/bucket not found/i.test(msg)) return "Logo storage isn't set up yet. Run supabase/migrations/0002_logos.sql in the Supabase SQL Editor, then try again.";
  if (/row-level security|unauthorized|not authorized/i.test(msg)) return "Only club admins can change logos.";
  if (/failed to fetch|network/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
  if (/too large|exceeded|size/i.test(msg)) return "That image is too large. Try a smaller one.";
  return msg || "Upload failed. Try again.";
}
