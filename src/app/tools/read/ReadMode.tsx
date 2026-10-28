"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, FileText, MessageSquareText, Minus, Plus } from "lucide-react";
import { readParagraphs, CompareReadError } from "@/lib/compare/extract-client";
import { readingMinutes, toReadBlocks, type ReadBlock } from "@/lib/read/structure";

export type ReadFile = { id: string; name: string; mimeType: string; objectKey: string; byteSize: number };

type Theme = "light" | "sepia" | "dark";
const SIZES = [15, 17, 19, 21, 24, 28];
const PREFS_KEY = "gai_read_prefs";
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

function loadPrefs(): { size: number; theme: Theme } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { size?: number; theme?: Theme };
    return {
      size: typeof p.size === "number" && p.size >= 0 && p.size < SIZES.length ? p.size : 1,
      theme: p.theme === "sepia" || p.theme === "dark" ? p.theme : "light"
    };
  } catch {
    return { size: 1, theme: "light" };
  }
}

export function ReadMode({ files, initialFileId }: { files: ReadFile[]; initialFileId?: string }) {
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? null);
  const [blocks, setBlocks] = useState<ReadBlock[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(1);
  const [theme, setTheme] = useState<Theme>("light");
  const file = files.find((f) => f.id === fileId) ?? null;

  useEffect(() => {
    const p = loadPrefs();
    setSize(p.size);
    setTheme(p.theme);
  }, []);

  function savePrefs(next: { size?: number; theme?: Theme }) {
    const merged = { size: next.size ?? size, theme: next.theme ?? theme };
    if (next.size !== undefined) setSize(next.size);
    if (next.theme !== undefined) setTheme(next.theme);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch { /* storage blocked */ }
  }

  useEffect(() => {
    let cancelled = false;
    setBlocks(null); setError(null); setProgress(null);
    if (!file) return;
    (async () => {
      try {
        const paras = await readParagraphs(file, (done, total) => { if (!cancelled) setProgress({ done, total }); });
        if (!cancelled) setBlocks(toReadBlocks(paras));
      } catch (err) {
        if (!cancelled) setError(err instanceof CompareReadError ? err.message : "This file couldn't be opened for reading.");
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  if (!file) {
    return (
      <div className="rm-pick">
        <div className="welcome-row">
          <div>
            <h1>Read <span>mode</span></h1>
            <p className="subtitle">Open any PDF or Word file as easy-to-read text that fits your phone screen. Bigger letters, no zooming or side-scrolling. Free, and it runs on your device.</p>
          </div>
        </div>
        <section className="panel-card">
          {files.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload a PDF or Word file in <Link href="/files">Files</Link> first.</p></div>
          ) : (
            <ul className="file-list">
              {files.map((f) => (
                <li key={f.id} className="file-row">
                  <span className="file-icon"><FileText size={18} aria-hidden="true" /></span>
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
                  <button type="button" className="link-button" onClick={() => setFileId(f.id)}>Read</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={`rm-wrap rm-${theme}`}>
      <div className="rm-bar" role="toolbar" aria-label="Reading options">
        <button type="button" className="link-button" onClick={() => setFileId(null)}>All files</button>
        <div className="rm-controls">
          <button type="button" className="rm-btn" aria-label="Smaller text" disabled={size === 0} onClick={() => savePrefs({ size: size - 1 })}><Minus size={16} aria-hidden="true" /></button>
          <span className="rm-size" aria-live="polite">{SIZES[size]}</span>
          <button type="button" className="rm-btn" aria-label="Bigger text" disabled={size === SIZES.length - 1} onClick={() => savePrefs({ size: size + 1 })}><Plus size={16} aria-hidden="true" /></button>
          <span className="rm-sep" aria-hidden="true" />
          {(["light", "sepia", "dark"] as Theme[]).map((t) => (
            <button key={t} type="button" className={`rm-theme rm-theme-${t}${theme === t ? " on" : ""}`} aria-label={`${t[0].toUpperCase()}${t.slice(1)} background`} aria-pressed={theme === t} onClick={() => savePrefs({ theme: t })}>A</button>
          ))}
        </div>
      </div>

      <article className="rm-doc" style={{ fontSize: `${SIZES[size]}px` }} lang="en">
        <header className="rm-head">
          <h1>{file.name}</h1>
          {blocks && <p>{readingMinutes(blocks)} min read</p>}
        </header>
        {error ? (
          <p className="form-message error" role="alert">{error}</p>
        ) : !blocks ? (
          <p className="rm-loading" role="status">
            <BookOpen size={18} aria-hidden="true" /> {progress ? `Preparing page ${progress.done} of ${progress.total}…` : "Opening the document…"}
          </p>
        ) : blocks.length === 0 ? (
          <p className="form-message warning">No text was found in this file.</p>
        ) : (
          blocks.map((b, i) => {
            switch (b.kind) {
              case "page": return <div key={i} className="rm-page" id={`page-${b.page}`}>Page {b.page}</div>;
              case "heading": return <h2 key={i}>{b.text}</h2>;
              case "item": return <p key={i} className="rm-item"><span className="rm-marker">{b.marker}</span><span>{b.text}</span></p>;
              default: return <p key={i}>{b.text}</p>;
            }
          })
        )}
        {blocks && blocks.length > 0 && (
          <footer className="rm-foot">
            <Link href={`/tools/chat?file=${file.id}`} className="secondary-button"><MessageSquareText size={15} aria-hidden="true" /> Ask AI about this</Link>
            <Link href={`/files/${file.id}`} className="link-button">Open the original</Link>
          </footer>
        )}
      </article>
    </div>
  );
}
