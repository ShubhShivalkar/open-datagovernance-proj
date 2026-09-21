import { useState } from "react";
import { MessageCircle, Mail, Linkedin, X, Github } from "lucide-react";

const CONTACTS = [
  {
    name: "Shubham Shivalkar",
    phone: "+91 88791 54181",
    whatsapp: "https://wa.me/918879154181",
    email: "shivalkarshubham1@gmail.com",
    linkedin: "https://linkedin.com/in/shubham-shivalkar-00a214134",
  },
  {
    name: "Pratik Mukherjee",
    phone: "+91 87774 09128",
    whatsapp: "https://wa.me/918777409128",
    email: "pratikmukherjee32@gmail.com",
    linkedin: "https://www.linkedin.com/in/pratikmukherjee20/",
  },
];

const MAIL_SUBJECT = encodeURIComponent("DGP — Demo / Enterprise Inquiry");

function ContactCard({ contact }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">{contact.name}</p>
      <div className="flex flex-col gap-2">
        <a
          href={contact.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle size={14} className="text-success shrink-0" />
          {contact.phone} · WhatsApp
        </a>
        <a
          href={`mailto:${contact.email}?subject=${MAIL_SUBJECT}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Mail size={14} className="text-primary shrink-0" />
          {contact.email}
        </a>
        <a
          href={contact.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Linkedin size={14} className="text-primary shrink-0" />
          LinkedIn
        </a>
      </div>
    </div>
  );
}

export default function ReachUsButton({ label = "Reach Us", className, Icon = MessageCircle }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? "btn-outline w-full justify-center py-2.5 text-sm"}>
        <Icon size={14} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-start justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-sm text-foreground">Reach Us</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Book a demo or get help deploying DGP in your environment.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="btn-ghost w-7 h-7 p-0 flex items-center justify-center shrink-0">
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
                <Github size={15} className="text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  DGP is <span className="font-medium text-foreground">open source</span> — the source
                  code is available and we're happy to share it if you'd like to review, self-host, or
                  contribute before committing to enterprise deployment support.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {CONTACTS.map((c) => (
                  <ContactCard key={c.email} contact={c} />
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-end">
              <button onClick={() => setOpen(false)} className="btn-outline text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
