export function SetupNotice() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">Almost there</h1>
        <p className="auth-subtitle">
          Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>, set{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev server.
        </p>
      </section>
    </main>
  );
}
