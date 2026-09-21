import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { datasourceApi } from "../api/client";
import {
  X, Loader2, CheckCircle, AlertCircle, ChevronRight,
} from "lucide-react";

const DB_TYPES = [
  { value: "mysql",      label: "MySQL",      icon: "🐬" },
  { value: "postgresql", label: "PostgreSQL",  icon: "🐘" },
];

const CREDENTIAL_FIELDS = {
  mysql: [
    { key: "host",     label: "Host",     placeholder: "localhost", half: true },
    { key: "port",     label: "Port",     placeholder: "3306",      half: true },
    { key: "database", label: "Database", placeholder: "mydb",      required: true },
    { key: "username", label: "Username", placeholder: "root",      required: true, half: true },
    { key: "password", label: "Password", type: "password",                        half: true },
  ],
  postgresql: [
    { key: "host",     label: "Host",     placeholder: "localhost",  half: true },
    { key: "port",     label: "Port",     placeholder: "5432",       half: true },
    { key: "database", label: "Database", placeholder: "mydb",       required: true },
    { key: "username", label: "Username", placeholder: "postgres",   required: true, half: true },
    { key: "password", label: "Password", type: "password",                         half: true },
    { key: "ssl_mode", label: "SSL Mode", placeholder: "disable / require" },
  ],
};

function Field({ label, required, children, half }) {
  return (
    <div className={half ? "w-full" : "col-span-2"}>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors";

export default function DataSourceForm({ onClose, onSuccess }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", description: "", db_type: "", business_context: "" });
  const [creds, setCreds] = useState({});
  const [testResult, setTestResult] = useState(null);

  const buildPayload = () => ({ ...form, credentials: creds });

  const createMut = useMutation({
    mutationFn: () => datasourceApi.create(buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasources"] });
      onSuccess?.();
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const ds = await datasourceApi.createRaw(buildPayload());
      try {
        return await datasourceApi.testConnection(ds.id);
      } finally {
        try { await datasourceApi.delete(ds.id); } catch (_) {}
      }
    },
    onSuccess: (result) => setTestResult(result),
  });

  const fields = CREDENTIAL_FIELDS[form.db_type] ?? [];
  const canSave = form.name && form.db_type;
  const selectedType = DB_TYPES.find((t) => t.value === form.db_type);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground text-base">Connect New Environment</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === 1 ? "Select database type" : `Connecting to ${selectedType?.label}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 1 — type picker */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {DB_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setForm({ ...form, db_type: t.value });
                    setCreds({});
                    setTestResult(null);
                    setStep(2);
                  }}
                  className="flex items-center gap-3 px-4 py-4 border border-border rounded-xl
                             hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <span className="text-3xl">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground group-hover:text-primary">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{t.value}</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — credentials */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Production Analytics"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Description
                  </label>
                  <input
                    className={inputCls}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Connection</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {fields.map((f) => (
                  <Field key={f.key} label={f.label} required={f.required} half={f.half}>
                    <input
                      className={inputCls}
                      type={f.type ?? "text"}
                      placeholder={f.placeholder ?? ""}
                      value={creds[f.key] ?? ""}
                      onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Business Context
                  <span className="ml-1 font-normal text-muted-foreground/60">(helps AI write richer descriptions)</span>
                </label>
                <textarea
                  className={`${inputCls} h-14 resize-none`}
                  placeholder="e.g. Customer data for churn analysis across APAC region…"
                  value={form.business_context}
                  onChange={(e) => setForm({ ...form, business_context: e.target.value })}
                />
              </div>

              {createMut.isError && (
                <div className="rounded-lg px-4 py-3 flex items-start gap-2 text-sm bg-destructive/10 text-destructive border border-destructive/30">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {createMut.error?.response?.data
                    ? JSON.stringify(createMut.error.response.data)
                    : "Something went wrong. Please try again."}
                </div>
              )}

              {testResult && (
                <div className={`rounded-lg px-4 py-3 flex items-start gap-2 text-sm ${
                  testResult.success
                    ? "bg-success/10 text-success border border-success/30"
                    : "bg-destructive/10 text-destructive border border-destructive/30"
                }`}>
                  {testResult.success
                    ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
                    : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
                  {testResult.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 1 && (
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <button onClick={onClose} className="btn-outline text-sm">Cancel</button>
          </div>
        )}

        {step === 2 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { setStep(1); setTestResult(null); }} className="btn-outline text-sm">
                ← Back
              </button>
              <button onClick={onClose} className="btn-ghost text-sm text-muted-foreground">Cancel</button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending || !form.name}
                className="btn-outline text-sm"
              >
                {testMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Test & Connect
              </button>
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !canSave}
                className="btn-primary text-sm"
              >
                {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Save Environment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
