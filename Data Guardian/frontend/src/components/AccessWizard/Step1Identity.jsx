import { useState } from "react";
import { ChevronRight, AlertCircle, Database, Plus, X } from "lucide-react";

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60";

export default function Step1Identity({ form, setForm, onNext }) {
  const [error, setError]           = useState("");
  const [extraInput, setExtraInput] = useState("");
  const [showExtra, setShowExtra]   = useState(false);

  function addExtraEmail() {
    const email = extraInput.trim();
    if (!email) return;
    if (!email.includes("@")) { setError("Additional email is not valid."); return; }
    if (form.additional_emails.includes(email)) return;
    setForm((f) => ({ ...f, additional_emails: [...f.additional_emails, email] }));
    setExtraInput("");
    setError("");
  }

  function removeExtraEmail(email) {
    setForm((f) => ({ ...f, additional_emails: f.additional_emails.filter((e) => e !== email) }));
  }

  function validate() {
    if (!form.subject_id.trim()) return "Please enter the data subject's identifier (e.g. their user ID).";
    if (!form.subject_email.trim()) return "Please enter the data subject's email address.";
    if (!form.subject_email.includes("@")) return "Subject email is not valid.";
    return "";
  }

  function handleNext() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    onNext();
  }

  return (
    <div className="space-y-6">
      {/* Active data source */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Data Source</label>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm text-foreground">
          <Database size={14} className="text-muted-foreground shrink-0" />
          <span className="font-medium">{form.datasource_name}</span>
          <span className="text-xs text-muted-foreground capitalize">({form.datasource_db_type})</span>
          <span className="ml-auto text-xs text-muted-foreground">Active environment</span>
        </div>
      </div>

      {/* Subject ID */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Subject Identifier
          <span className="text-muted-foreground font-normal ml-1.5 text-xs">— the raw ID value (e.g. 42, usr_123)</span>
        </label>
        <input
          type="text"
          className={inputCls}
          placeholder="e.g. 42"
          value={form.subject_id}
          onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}
        />
      </div>

      {/* Subject email */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Subject Email
          <span className="text-muted-foreground font-normal ml-1.5 text-xs">— report will be sent here</span>
        </label>
        <input
          type="email"
          className={inputCls}
          placeholder="e.g. john.doe@example.com"
          value={form.subject_email}
          onChange={(e) => setForm((f) => ({ ...f, subject_email: e.target.value }))}
        />
      </div>

      {/* Additional emails */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Plus size={12} /> Add additional report recipients (optional)
        </button>

        {showExtra && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="email"
                className={`${inputCls} flex-1`}
                placeholder="colleague@example.com"
                value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtraEmail())}
              />
              <button type="button" onClick={addExtraEmail} className="btn btn-outline text-xs px-3">
                Add
              </button>
            </div>
            {form.additional_emails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {form.additional_emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary"
                  >
                    {email}
                    <button type="button" onClick={() => removeExtraEmail(email)}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disabled multi-user notice */}
      <div className="flex items-start gap-2.5 bg-muted/40 border border-border rounded-lg px-4 py-3">
        <AlertCircle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <strong>Bulk mode</strong> (uploading a list of subject IDs and emails) is currently disabled.
          Process requests one at a time using the fields above.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button type="button" onClick={handleNext} className="btn btn-primary flex items-center gap-2">
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
