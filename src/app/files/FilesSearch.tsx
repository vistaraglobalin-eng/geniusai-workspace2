"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { FILE_SORTS, PAGE_SIZE, filesHref, type FileSort, type FilesQuery } from "@/lib/files-query";

/** Search box (debounced, 250 ms) and sort menu. State lives in the URL. */
export function FilesSearch({ query }: { query: FilesQuery }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL changes (Back button, chip links).
  useEffect(() => setText(query.q), [query.q]);

  function go(patch: Partial<FilesQuery>) {
    startTransition(() => router.replace(filesHref({ ...patch, limit: PAGE_SIZE }, query), { scroll: false }));
  }

  function onType(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim().slice(0, 100) }), 250);
  }

  return (
    <>
      <div className="files-search input-with-icon" role="search">
        <Search size={16} aria-hidden="true" />
        <label htmlFor="file-search" className="visually-hidden">Search files by name</label>
        <input
          id="file-search"
          className="text-input"
          type="search"
          placeholder="Search files by name"
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && text) onType(""); }}
          autoComplete="off"
          maxLength={100}
          aria-busy={pending}
        />
        {text && (
          <button type="button" className="icon-button" style={{ position: "absolute", right: 4 }} aria-label="Clear search" onClick={() => onType("")}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <label htmlFor="file-sort" className="visually-hidden">Sort files</label>
      <select id="file-sort" className="select-input" value={query.sort} onChange={(e) => go({ sort: e.target.value as FileSort })}>
        {(Object.keys(FILE_SORTS) as FileSort[]).map((s) => <option key={s} value={s}>{FILE_SORTS[s].label}</option>)}
      </select>
    </>
  );
}
