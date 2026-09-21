import clsx from "clsx";

const CONFIGS = {
  connected:  { label: "Connected",  cls: "pill-green"  },
  error:      { label: "Error",      cls: "pill-red"    },
  pending:    { label: "Pending",    cls: "pill-gray"   },
  running:    { label: "Running",    cls: "pill-blue"   },
  completed:  { label: "Completed",  cls: "pill-green"  },
  failed:     { label: "Failed",     cls: "pill-red"    },
  none:       { label: "No PII",     cls: "pill-gray"   },
  low:        { label: "Low PII",    cls: "pill-amber"  },
  medium:     { label: "Med PII",    cls: "bg-amber-100 text-amber-700 pill" },
  high:       { label: "High PII",   cls: "pill-red"    },
};

export default function StatusBadge({ status, className }) {
  const cfg = CONFIGS[status] ?? { label: status, cls: "pill-gray" };
  return (
    <span className={clsx("pill", cfg.cls, className)}>
      {cfg.label}
    </span>
  );
}
