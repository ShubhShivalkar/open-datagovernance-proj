import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useEnv } from "../../context/EnvContext";
import { useAuth } from "../../context/AuthContext";
import Step1Input from "./Step1Input";
import Step2Reference from "./Step2Reference";
import Step3Plan from "./Step3Plan";
import Step4Approval from "./Step4Approval";

const STEPS = [
  "Provide Identifiers",
  "Choose Reference Field",
  "Review Erasure Plan",
  "DGO Approval",
];

function displayName(user) {
  if (!user) return "";
  return user.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : user.username ?? "";
}

function makeEmptyForm(activeEnv, user) {
  return {
    datasource_id:      activeEnv?.id ?? "",
    datasource_name:    activeEnv?.name ?? "",
    datasource_db_type: activeEnv?.db_type ?? "",
    data_principal_id:  displayName(user),
    input_type:        "text",
    input_raw:         "",
    source_table:      "",
    source_column:     "",
    identifier_table:  "",
    identifier_column: "",
    reason:            "",
  };
}

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                    ? "bg-primary/10 border-2 border-primary text-primary"
                    : "bg-muted border border-border text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap hidden sm:block ${
                  active ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 transition-colors ${
                  done ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ErasureWizard() {
  const { activeEnv } = useEnv();
  const { user } = useAuth();
  const [step, setStep]          = useState(0);
  const [form, setForm]          = useState(() => makeEmptyForm(activeEnv, user));
  const [requestId, setRequestId] = useState(null);

  // Sync active environment into form whenever it changes (handles the case
  // where activeEnv is null on first mount and loads later).
  useEffect(() => {
    if (activeEnv) {
      setForm((f) => ({
        ...f,
        datasource_id:      activeEnv.id,
        datasource_name:    activeEnv.name,
        datasource_db_type: activeEnv.db_type,
      }));
    }
  }, [activeEnv]);

  // Sync logged-in user's display name into the data_principal_id field only
  // if the user hasn't typed anything yet.
  useEffect(() => {
    const name = displayName(user);
    if (name) {
      setForm((f) => ({ ...f, data_principal_id: f.data_principal_id || name }));
    }
  }, [user]);

  function reset() {
    setStep(0);
    setForm(makeEmptyForm(activeEnv, user));
    setRequestId(null);
  }

  if (!activeEnv) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertCircle size={28} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No active environment selected</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Select a data source from the environment switcher in the sidebar to use Full Erasure.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator current={step} />

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        {step === 0 && (
          <Step1Input
            form={form}
            setForm={setForm}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <Step2Reference
            form={form}
            setForm={setForm}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step3Plan
            form={form}
            requestId={requestId}
            setRequestId={setRequestId}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step4Approval
            requestId={requestId}
            form={form}
            onBack={() => setStep(2)}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
