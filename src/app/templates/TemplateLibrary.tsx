"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, Sparkles, X } from "lucide-react";
import { LIBRARY, LIB_CATEGORIES, type LibCategory } from "@/lib/templates-library";

export function TemplateLibrary() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<LibCategory | "all">("all");
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return LIBRARY.filter((i) => (cat === "all" || i.category === cat) && (!t || `${i.title} ${i.text} ${i.tags} ${i.category}`.toLowerCase().includes(t)));
  }, [q, cat]);
  const groups = (cat === "all" ? LIB_CATEGORIES : [cat]).map((c) => ({ c, rows: items.filter((i) => i.category === c) })).filter((g) => g.rows.length);

  return (
    <div className="tl">
      <div className="tl-search input-with-icon" role="search">
        <Search size={16} aria-hidden="true" />
        <label htmlFor="tl-q" className="visually-hidden">Search templates</label>
        <input id="tl-q" className="text-input" type="search" placeholder="Search — e.g. offer letter, rent, NDA, bank" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} autoComplete="off" />
        {q && <button type="button" className="icon-button" style={{ position: "absolute", right: 4 }} aria-label="Clear search" onClick={() => setQ("")}><X size={16} aria-hidden="true" /></button>}
      </div>
      <nav className="spaces-row tl-cats" aria-label="Categories">
        <button type="button" className={`space-chip${cat === "all" ? " on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>All <span>{LIBRARY.length}</span></button>
        {LIB_CATEGORIES.map((c) => (
          <button key={c} type="button" className={`space-chip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c} <span>{LIBRARY.filter((i) => i.category === c).length}</span></button>
        ))}
      </nav>
      <p className="lt-help tl-legend"><span className="tl-badge free">Free</span> filled with a form, made on your device · <span className="tl-badge ai"><Sparkles size={11} aria-hidden="true" /> AI</span> drafted for you, uses credits</p>
      {groups.length === 0 ? <p className="dg-hint">No templates match “{q}”. Try another word, or <Link href="/tools/agreements/new">describe any document</Link> and AI will draft it.</p> : groups.map((g) => (
        <section key={g.c} className="tl-group" aria-labelledby={`tl-${g.c}`}>
          <h2 id={`tl-${g.c}`} className="home-section-title">{g.c}</h2>
          <div className="tl-grid">
            {g.rows.map((i) => (
              <Link key={i.id} href={i.href} className="tl-card">
                <span className="tl-card-top"><strong>{i.title}</strong><span className={`tl-badge ${i.kind}`}>{i.kind === "ai" ? <><Sparkles size={11} aria-hidden="true" /> AI</> : "Free"}</span></span>
                <span className="tl-card-text">{i.text}</span>
                <ChevronRight size={16} className="tl-go" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
