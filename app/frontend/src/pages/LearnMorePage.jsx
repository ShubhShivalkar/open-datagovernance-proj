import {
  BookOpen, ShieldCheck, Layers, Users, Bot, Code, Activity,
  Eye, Lock, Sparkles, ArrowRight, CheckCircle2, Database,
  Plug, ScanSearch, ShieldAlert, Share2, Github,
} from "lucide-react";
import ReachUsButton from "../components/ReachUsButton";
import logoDark from "../assets/logo-dark.png";

const FEATURES = [
  {
    Icon: BookOpen,
    title: "AI-Powered Data Catalogue",
    body: "Scans every connected schema and uses AI to describe each table and column automatically, flag likely PII with a confidence level, and visualize how tables relate to each other on an interactive Data Map.",
  },
  {
    Icon: ShieldCheck,
    title: "Compliance Suite",
    body: "Right to Erasure (GDPR/DPDPA), Data Subject Access Requests, Row-Level Security & Obfuscation, Retention Policies, and Do Not Sell — all backed by real, auditable execution against your data.",
  },
  {
    Icon: Layers,
    title: "Data Islands",
    body: "Spin up governed SQL views scoped to exactly what a team needs — with static or scheduled refresh and a per-island PII policy — so you can share data without sharing raw database access.",
  },
  {
    Icon: Users,
    title: "IAM & Access",
    body: "See who holds which database credentials at a glance, and organize them into access groups and policies instead of managing permissions one user at a time.",
  },
  {
    Icon: Activity,
    title: "Routines",
    body: "Keep Data Islands fresh automatically — scheduled refreshes run on your cadence so downstream consumers always see current data.",
  },
  {
    Icon: Bot,
    title: "AI Assistant",
    body: "Ask questions about your data in plain English and get answers grounded in your catalogue — no SQL required.",
    comingSoon: true,
  },
  {
    Icon: Code,
    title: "Query Editor",
    body: "Write and run SQL directly against connected sources, save queries, and export results without leaving DGP.",
    comingSoon: true,
  },
];

const STEPS = [
  { Icon: Plug,        title: "Connect",  body: "Point DGP at a database — Postgres, MySQL, Snowflake, RDS, or more." },
  { Icon: ScanSearch,  title: "Catalogue", body: "AI scans the schema, describes it, and flags PII automatically." },
  { Icon: ShieldAlert, title: "Govern",   body: "Apply erasure, access, retention, and masking policies with full audit trails." },
  { Icon: Share2,      title: "Share",    body: "Publish governed Data Islands so teams get exactly the data they need, safely." },
];

function FeatureCard({ Icon, title, body, comingSoon }) {
  return (
    <div className="card space-y-3 relative">
      {comingSoon && (
        <span className="badge bg-warning/10 text-warning absolute top-4 right-4">
          <Sparkles size={10} /> Coming Soon
        </span>
      )}
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon size={20} className="text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

export default function LearnMorePage() {
  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-10">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 px-8 py-14 text-center">
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-10 w-72 h-72 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

        <div className="relative">
          <img
            src={logoDark}
            alt="DGP — Open Data Governance and Compliance"
            className="mx-auto w-48 sm:w-56 rounded-2xl mb-6 shadow-lg shadow-primary/20"
          />
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Know your data. Govern it with confidence.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
            DGP (Open Data Governance and Compliance) is an enterprise data governance platform that automatically
            catalogues your databases, finds sensitive data, and gives you real, auditable tools to act
            on privacy requests — without months of manual mapping.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <ReachUsButton label="Book a Demo" Icon={ArrowRight} className="btn-primary py-2.5 px-5 text-sm" />
            <a
              href="#features"
              className="btn-outline py-2.5 px-5 text-sm"
            >
              Explore Features
            </a>
          </div>
        </div>
      </div>

      {/* ── Why it matters ──────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { Icon: Eye,      title: "Know what you have", body: "Most teams can't say with confidence which tables hold personal data. DGP tells you, automatically." },
          { Icon: Lock,     title: "Prove compliance",   body: "Erasure, access, and retention requests run as real, auditable operations — not spreadsheets and best effort." },
          { Icon: Database, title: "Share safely",       body: "Data Islands let teams get the slice of data they need without ever touching the raw production database." },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon size={17} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Feature grid ─────────────────────────────────────────── */}
      <div id="features" className="space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">Everything governance needs, in one place</h2>
          <p className="text-sm text-muted-foreground">Seven modules that cover the full lifecycle of your data, end to end.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">How it works</h2>
          <p className="text-sm text-muted-foreground">From a connection string to a governed, shareable dataset.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ Icon, title, body }, i) => (
            <div key={title} className="card relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                <Icon size={16} className="text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight size={14} className="hidden lg:block text-muted-foreground absolute top-1/2 -right-3 -translate-y-1/2" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Trust callout ─────────────────────────────────────────── */}
      <div className="card bg-primary/5 border-primary/10">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="text-primary shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Built with isolation and least-access in mind</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-success shrink-0" /> Table descriptions and PII flags come from a small local data sample, not a full export — analyzed on-device by default via Ollama.</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-success shrink-0" /> Credentials are encrypted at rest, never exposed to the frontend.</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-success shrink-0" /> Every erasure and access action leaves an immutable audit trail.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── CTA footer ───────────────────────────────────────────── */}
      <div className="card text-center py-10 space-y-4">
        <div className="mx-auto w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Github size={20} className="text-primary" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">Open source, and built to be deployed on your terms</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Want to see the source, self-host it, or get help rolling it out at your company?
            We're happy to talk.
          </p>
        </div>
        <div className="flex items-center justify-center">
          <ReachUsButton label="Reach Us" className="btn-primary py-2.5 px-5 text-sm" />
        </div>
      </div>
    </div>
  );
}
