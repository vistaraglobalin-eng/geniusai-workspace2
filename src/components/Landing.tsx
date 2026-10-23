import Link from "next/link";
import { Combine, FilePen, FileText, Lock, MessageSquareText, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { PromptBox } from "@/components/PromptBox";
import { TEMPLATES } from "@/lib/agreements/templates";

const FEATURES = [
  { Icon: FilePen, title: "Agreement Studio", text: "Describe what you need, or pick a template. Get a complete, India-ready draft, edit it, and keep every version." },
  { Icon: MessageSquareText, title: "Explain any contract", text: "Upload an agreement you were sent. See what it really says, what to watch out for, and what to ask." },
  { Icon: FileText, title: "Document Genius", text: "Summaries, translation into Indian languages, OCR for scans, and tables pulled out to Excel." },
  { Icon: Combine, title: "Every PDF tool", text: "Merge, split, compress, protect, unlock, convert Office files and more, free." }
] as const;

/** The home page for signed-out visitors. */
export function Landing() {
  return (
    <PublicLayout current="/">
      <section className="landing-hero">
        <div className="eyebrow"><span className="eyebrow-dot" /> AI WORKSPACE FOR DOCUMENTS</div>
        <h1>Draft, understand and finish <span>every document.</span></h1>
        <p className="legal-lead">Agreements, PDFs and paperwork in one private workspace, built for India.</p>
        <div className="panel-card landing-prompt"><PromptBox heading="What agreement do you need?" /></div>
        <p className="field-hint">You’ll be asked to sign in first. New workspaces start with free credits.</p>
      </section>

      <section className="landing-templates" aria-labelledby="popular">
        <h2 id="popular">Popular templates</h2>
        <div className="chip-row">
          {TEMPLATES.map((t) => <Link key={t.key} className="chip" href={`/tools/agreements/new?template=${t.key}`}>{t.title}</Link>)}
        </div>
      </section>

      <section className="landing-features" aria-label="Features">
        {FEATURES.map(({ Icon, title, text }) => (
          <article key={title} className="panel-card landing-feature">
            <span className="tool-icon lavender"><Icon size={20} aria-hidden="true" /></span>
            <h3>{title}</h3><p>{text}</p>
          </article>
        ))}
      </section>

      <section className="landing-trust" aria-label="Privacy">
        <div><ShieldCheck size={20} aria-hidden="true" /><span><strong>Private by default.</strong> Only your workspace can open your files.</span></div>
        <div><Lock size={20} aria-hidden="true" /><span><strong>AI only when you ask.</strong> A file is sent to the AI provider only when you run a task on it.</span></div>
        <div><Zap size={20} aria-hidden="true" /><span><strong>Pay as you go.</strong> Credits in rupees; unused holds are returned. <Link href="/pricing">See pricing</Link></span></div>
      </section>

      <div className="landing-cta">
        <Link className="primary-button" href="/login"><Sparkles size={16} aria-hidden="true" /> Get started free</Link>
      </div>
    </PublicLayout>
  );
}
