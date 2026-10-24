import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentType } from "react";

export type HubRow = { href: string; title: string; text: string; Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>; tint: string };
export type HubSection = { title: string; rows: HubRow[] };

/** The hub's content (also used on its own in previews). */
export function HubBody({ title, tag, intro, sections }: { title: string; tag: string; intro: string; sections: HubSection[] }) {
  return (
    <>
      <section className="hub-hero">
        <span className="pill-accent">{tag}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </section>
      <div className="service-groups">
        {sections.map((s) => (
          <section key={s.title} className="service-group" aria-labelledby={`h-${s.title}`}>
            <h2 id={`h-${s.title}`}>{s.title}</h2>
            <ul className="list-card">
              {s.rows.map(({ href, title: t, text, Icon, tint }) => (
                <li key={href + t}>
                  <Link href={href} className="list-row">
                    <span className={`app-icon ${tint}`}><Icon size={17} aria-hidden="true" /></span>
                    <span className="list-text"><strong>{t}</strong><span>{text}</span></span>
                    <ChevronRight size={17} className="list-chevron" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
