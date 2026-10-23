import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type Tint = "indigo" | "purple" | "green" | "orange" | "blue" | "teal" | "cyan" | "red" | "gray";

/** One row of an iOS Settings-style grouped list: coloured icon tile, title, one line of detail, chevron. */
export function ListRow({ href, title, text, tint, icon, badge }: {
  href?: string; title: ReactNode; text?: ReactNode; tint: Tint; icon: ReactNode; badge?: ReactNode;
}) {
  const inner = (
    <>
      <span className={`app-icon ${tint}`}>{icon}</span>
      <span className="list-text"><strong>{title}</strong>{text && <span>{text}</span>}</span>
      {badge ?? (href ? <ChevronRight size={17} className="list-chevron" aria-hidden="true" /> : null)}
    </>
  );
  return <li>{href ? <Link href={href} className="list-row">{inner}</Link> : <div className="list-row muted">{inner}</div>}</li>;
}
