-- Overlap: calendar links work without the server's secret key.
-- Each link carries a long random code (about 240 bits) that is checked inside calendar_feed(),
-- so the site can ask for a feed with its public key. Without the right code, nothing is returned.
-- Safe to run more than once.
grant execute on function public.calendar_feed(text) to anon;
notify pgrst, 'reload schema';
