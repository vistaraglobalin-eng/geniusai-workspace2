import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentType } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n-server";

export type HubRow = { href: string; title: string; text: string; Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>; tint: string };
export type HubSection = { title: string; rows: HubRow[] };

/** The hub's content (also used on its own in previews). */
export function HubBody({ title, tag, intro, sections, lang = "en" }: { title: string; tag: string; intro: string; sections: HubSection[]; lang?: Lang }) {
  const tr = (s: string) => t(lang, s);
  return (
    <>
      <section className="hub-hero">
        <span className="pill-accent">{tr(tag)}</span>
        <h1>{tr(title)}</h1>
        <p>{tr(intro)}</p>
      </section>
      <div className="service-groups">
        {sections.map((s) => (
          <section key={s.title} className="service-group" aria-labelledby={`h-${s.title}`}>
            <h2 id={`h-${s.title}`}>{tr(s.title)}</h2>
            <ul className="list-card">
              {s.rows.map(({ href, title: rowTitle, text, Icon, tint }) => (
                <li key={href + rowTitle}>
                  <Link href={href} className="list-row">
                    <span className={`app-icon ${tint}`}><Icon size={17} aria-hidden="true" /></span>
                    <span className="list-text"><strong>{tr(rowTitle)}</strong><span>{tr(text)}</span></span>
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
