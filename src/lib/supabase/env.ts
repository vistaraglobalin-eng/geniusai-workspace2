// Single source of truth for the public Supabase settings.
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is preferred (Supabase's newer key name);
// NEXT_PUBLIC_SUPABASE_ANON_KEY is accepted so older setups keep working.
// Both are safe to expose to the browser. Never put the service-role key here.
//
// Note: Next.js inlines NEXT_PUBLIC_ variables at build time only when they are
// referenced literally, so each name is written out in full below.

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key, configured: Boolean(url && key) };
}
