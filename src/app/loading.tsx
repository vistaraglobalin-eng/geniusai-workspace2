/** Shown instantly while a page loads: the shape of the page, gently shimmering. */
export default function Loading() {
  return (
    <div className="app-shell" aria-busy="true" aria-label="Loading">
      <aside className="sidebar" aria-hidden="true">
        <div className="skeleton" style={{ height: 34, width: 160, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: 44, borderRadius: 999, marginBottom: 16 }} />
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton" style={{ height: 30, marginBottom: 10, width: `${70 + ((i * 13) % 25)}%` }} />)}
      </aside>
      <div className="main-panel">
        <div className="topbar" />
        <main className="content">
          <div className="skeleton-page">
            <div className="skeleton" style={{ height: 40, width: "55%" }} />
            <div className="skeleton" style={{ height: 18, width: "35%" }} />
            <div className="skeleton" style={{ height: 180, marginTop: 10 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div className="skeleton" style={{ height: 96 }} /><div className="skeleton" style={{ height: 96 }} /><div className="skeleton" style={{ height: 96 }} />
            </div>
            <div className="skeleton" style={{ height: 240 }} />
          </div>
        </main>
      </div>
      <nav className="bottom-nav" aria-hidden="true" />
    </div>
  );
}
