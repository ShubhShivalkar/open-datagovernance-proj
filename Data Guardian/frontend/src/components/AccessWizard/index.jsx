import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useEnv } from "../../context/EnvContext";
import { useAuth } from "../../context/AuthContext";
import Step1Identity from "./Step1Identity";
import Step2Reference from "./Step2Reference";
import Step3Discovery from "./Step3Discovery";
import Step4Report from "./Step4Report";

const STEPS = [
  "Subject Identity",
  "Reference Field",
  "Data Discovery",
  "Report",
];

function makeEmptyForm(activeEnv) {
  return {
    datasource_id:      activeEnv?.id ?? "",
    datasource_name:    activeEnv?.name ?? "",
    datasource_db_type: activeEnv?.db_type ?? "",
    subject_id:         "",
    subject_email:      "",
    additional_emails:  [],
    identifier_table:   "",
    identifier_column:  "",
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
              <div className={`flex-1 h-px mx-2 transition-colors ${done ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AccessWizard() {
  const { activeEnv } = useEnv();
  const [step, setStep]          = useState(0);
  const [form, setForm]          = useState(() => makeEmptyForm(activeEnv));
  const [requestId, setRequestId] = useState(null);

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

  function reset() {
    setStep(0);
    setForm(makeEmptyForm(activeEnv));
    setRequestId(null);
  }

  if (!activeEnv) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertCircle size={28} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No active environment selected</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Select a data source from the environment switcher in the sidebar to use Data Access Request.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator current={step} />

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        {step === 0 && (
          <Step1Identity form={form} setForm={setForm} onNext={() => setStep(1)} />
        )}
        {step === 1 && (
          <Step2Reference form={form} setForm={setForm} onBack={() => setStep(0)} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step3Discovery
            form={form}
            requestId={requestId}
            setRequestId={setRequestId}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step4Report form={form} requestId={requestId} onReset={reset} />
        )}
      </div>
    </div>
  );
}
