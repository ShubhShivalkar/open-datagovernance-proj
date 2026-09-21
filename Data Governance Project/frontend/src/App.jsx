import { useState, useRef, useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, BookOpen, Activity,
  Settings, Bell, RotateCcw, Zap, BookMarked, MessageCircle,
  Bot, Code, FileWarning, Layers, Search, Database,
  ChevronUp, CheckCircle2, ArrowRight, Users, ChevronDown,
  UserCog, ShieldOff, LogOut, Loader2,
  Eraser, ShieldCheck, ClipboardList, Timer, Ban,
} from "lucide-react";
import logoDark from "./assets/logo-dark.png";
import { datasourceApi } from "./api/client";
import { vendorIcon, vendorLabel } from "./dbVendorDisplay";
import { EnvProvider, useEnv } from "./context/EnvContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ReachUsButton from "./components/ReachUsButton";
import LearnMorePage from "./pages/LearnMorePage";
import DataSourcesPage from "./pages/DataSourcesPage";
import DataIslandsPage from "./pages/DataIslandsPage";
import DataIslandDetailPage from "./pages/DataIslandDetailPage";
import CataloguePage from "./pages/CataloguePage";
import TableDetailPage from "./pages/TableDetailPage";
import RunsPage from "./pages/RunsPage";
import DashboardPage from "./pages/DashboardPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import QueryEditorPage from "./pages/QueryEditorPage";
import ErasureRequestsPage from "./pages/ErasureRequestsPage";
import ComplianceErasurePage from "./pages/ComplianceErasurePage";
import ComplianceRLSPage from "./pages/ComplianceRLSPage";
import ComplianceDataAccessPage from "./pages/ComplianceDataAccessPage";
import ComplianceRetentionPage from "./pages/ComplianceRetentionPage";
import ComplianceDoNotSellPage from "./pages/ComplianceDoNotSellPage";
import IAMPage from "./pages/IAMPage";
import LoginPage from "./pages/LoginPage";
import UserManagementPage from "./pages/UserManagementPage";

const NAV_TOP = [
  { to: "/catalogue",    label: "Data Catalog",   Icon: BookOpen },
];

const NAV_REST = [
  { to: "/data-islands", label: "Data Islands",   Icon: Layers },
  { to: "/iam",          label: "IAM & Access",   Icon: Users },
  { to: "/runs",         label: "Routines",       Icon: Activity },
  { to: "/ai-assistant", label: "AI Assistant",   Icon: Bot },
  { to: "/query-editor", label: "Query Editor",   Icon: Code },
];


function RequireAuth({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} /> Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={
        <RequireAuth>
        <EnvProvider>
        <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside className="w-60 bg-sidebar flex flex-col shrink-0 border-r border-sidebar-border shadow-sm">

        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-sidebar-border">
          <img src={logoDark} alt="DGP" className="w-9 h-9 rounded-lg shrink-0 object-cover" />
          <div>
            <p className="font-bold text-foreground text-sm leading-tight">DGP</p>
            <p className="text-[9px] font-semibold text-muted-foreground tracking-widest uppercase">
              Open Data Governance and Compliance
            </p>
          </div>
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_TOP.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}>
              {({ isActive }) => (
                <div className={`nav-item ${isActive ? "nav-item-active" : ""}`}>
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  {label}
                </div>
              )}
            </NavLink>
          ))}
          <ComplianceGroup />
          {NAV_REST.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}>
              {({ isActive }) => (
                <div className={`nav-item ${isActive ? "nav-item-active" : ""}`}>
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Trigger Scan CTA */}
        <div className="px-3 mb-3">
          <TriggerScanButton />
        </div>

        {/* Bottom nav */}
        <div className="px-3 pt-1 border-t border-sidebar-border space-y-0.5">
          <NavLink to="/dashboard">
            {({ isActive }) => (
              <div className={`nav-item ${isActive ? "nav-item-active" : ""}`}>
                <LayoutDashboard size={16} strokeWidth={2} /> Global Monitor
              </div>
            )}
          </NavLink>
          <SettingsGroup />
          <NavLink to="/learn-more">
            {({ isActive }) => (
              <div className={`nav-item ${isActive ? "nav-item-active" : ""}`}>
                <BookMarked size={16} strokeWidth={2} /> Learn More
              </div>
            )}
          </NavLink>
          <ReachUsButton label="Reach Us" Icon={MessageCircle} className="nav-item w-full" />
        </div>

        {/* Environment selector */}
        <EnvSelector />
      </aside>

      {/* ── Right panel ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="bg-card border-b border-border px-6 py-3 flex items-center gap-4 shrink-0">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm bg-muted/50 border-0 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-card
                         placeholder:text-muted-foreground transition-colors"
              placeholder="Search data assets…"
            />
          </div>

          <div className="flex-1" />

          {/* Icons */}
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <Bell size={16} />
            </button>
            <button className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw size={15} />
            </button>
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/"              element={<Navigate to="/catalogue" replace />} />
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/datasources"   element={<DataSourcesPage />} />
            <Route path="/catalogue"     element={<CataloguePage />} />
            <Route path="/catalogue/tables/:id" element={<TableDetailPage />} />
            <Route path="/runs"          element={<RunsPage />} />
            <Route path="/ai-assistant"  element={<AIAssistantPage />} />
            <Route path="/query-editor"  element={<QueryEditorPage />} />
            <Route path="/data-islands"     element={<DataIslandsPage />} />
            <Route path="/data-islands/:id" element={<DataIslandDetailPage />} />
            <Route path="/erasure"                  element={<Navigate to="/compliance/erasure" replace />} />
            <Route path="/compliance"               element={<Navigate to="/compliance/erasure" replace />} />
            <Route path="/compliance/erasure"       element={<ComplianceErasurePage />} />
            <Route path="/compliance/rls"           element={<ComplianceRLSPage />} />
            <Route path="/compliance/data-access"   element={<ComplianceDataAccessPage />} />
            <Route path="/compliance/retention"     element={<ComplianceRetentionPage />} />
            <Route path="/compliance/do-not-sell"  element={<ComplianceDoNotSellPage />} />
            <Route path="/iam"           element={<IAMPage />} />
            <Route path="/settings/users"   element={<UserManagementPage />} />
            <Route path="/settings"      element={<Navigate to="/settings/users" replace />} />
            <Route path="/support"       element={<PlaceholderPage title="Support" subtitle="Documentation and help resources" />} />
            <Route path="/learn-more"    element={<LearnMorePage />} />
          </Routes>
        </main>
      </div>
        </div>
        </EnvProvider>
        </RequireAuth>
      } />
    </Routes>
    </AuthProvider>
  );
}

// ── Trigger Scan CTA + confirmation dialog ────────────────────────────────────

function TriggerScanButton() {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="btn-primary w-full justify-center py-2.5 text-sm"
      >
        <Zap size={14} />
        Trigger Scan
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-sm text-foreground">Trigger Scan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Essentially ensuring database is reconciled with the current environment,
                including all the metadata that would be used by the system.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="btn-outline text-xs">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  alert("This feature is coming soon.");
                }}
                className="btn-primary text-xs"
              >
                Go Ahead
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Compliance expandable group ───────────────────────────────────────────────

function ComplianceGroup() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isActive = location.pathname.startsWith("/compliance");

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`nav-item w-full ${isActive ? "nav-item-active" : ""}`}
      >
        <FileWarning size={16} strokeWidth={2} />
        <span className="flex-1 text-left">Compliance</span>
        <ChevronDown size={13} className={`transition-transform ${open || isActive ? "rotate-180" : ""}`} />
      </button>
      {(open || isActive) && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          <NavLink to="/compliance/erasure">
            {({ isActive: a }) => (
              <div className={`nav-item text-xs py-1.5 ${a ? "nav-item-active" : ""}`}>
                <Eraser size={13} /> Full Erasure
              </div>
            )}
          </NavLink>
          <NavLink to="/compliance/rls">
            {({ isActive: a }) => (
              <div className={`nav-item text-xs py-1.5 ${a ? "nav-item-active" : ""}`}>
                <ShieldCheck size={13} /> RLS & Obfuscation
              </div>
            )}
          </NavLink>
          <NavLink to="/compliance/data-access">
            {({ isActive: a }) => (
              <div className={`nav-item text-xs py-1.5 ${a ? "nav-item-active" : ""}`}>
                <ClipboardList size={13} /> Data Access Request
              </div>
            )}
          </NavLink>
          <NavLink to="/compliance/retention">
            {({ isActive: a }) => (
              <div className={`nav-item text-xs py-1.5 ${a ? "nav-item-active" : ""}`}>
                <Timer size={13} /> Retention Policy
              </div>
            )}
          </NavLink>
          <NavLink to="/compliance/do-not-sell">
            {({ isActive: a }) => (
              <div className={`nav-item text-xs py-1.5 ${a ? "nav-item-active" : ""}`}>
                <Ban size={13} /> Do Not Sell
              </div>
            )}
          </NavLink>
        </div>
      )}
    </div>
  );
}

// ── Settings expandable group ─────────────────────────────────────────────────

function SettingsGroup() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isActive = location.pathname.startsWith("/settings");

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`nav-item w-full ${isActive ? "nav-item-active" : ""}`}
      >
        <Settings size={16} strokeWidth={2} />
        <span className="flex-1 text-left">Settings</span>
        <ChevronDown size={13} className={`transition-transform ${open || isActive ? "rotate-180" : ""}`} />
      </button>
      {(open || isActive) && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          <NavLink to="/settings/users">
            {({ isActive: a }) => (
              <div className={`nav-item text-xs py-1.5 ${a ? "nav-item-active" : ""}`}>
                <UserCog size={13} /> User Management
              </div>
            )}
          </NavLink>
          <div className="nav-item text-xs py-1.5 opacity-40 cursor-not-allowed select-none">
            <ShieldOff size={13} /> Policies <span className="ml-auto text-[9px]">soon</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Header user menu ──────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : user?.username ?? "User";
  const initial = displayName.charAt(0).toUpperCase();
  const roleLabel = user?.is_superuser ? "Superuser" : user?.is_staff ? "Staff" : "Standard";

  return (
    <div ref={ref} className="relative pl-3 border-l border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="text-right">
          <p className="text-xs font-semibold text-foreground leading-tight">{displayName}</p>
          <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
          {initial}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-foreground truncate">@{user?.username}</p>
            {user?.db_user_username && (
              <p className="text-[10px] text-muted-foreground truncate">DB: {user.db_user_username}</p>
            )}
          </div>
          <button
            onClick={() => { setOpen(false); navigate("/settings/users"); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors"
          >
            <UserCog size={12} /> Manage Users
          </button>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 transition-colors border-t border-border"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function EnvSelector() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { activeEnv, setActiveEnv } = useEnv();

  const { data } = useQuery({ queryKey: ["datasources"], queryFn: datasourceApi.list });
  const sources = data?.results ?? data ?? [];

  // Auto-select first env when data loads
  useEffect(() => {
    if (!activeEnv && sources.length > 0) setActiveEnv(sources[0]);
  }, [sources, activeEnv, setActiveEnv]);

  const active = activeEnv;

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative px-3 pb-4 pt-2 border-t border-sidebar-border">
      {/* Drop-up menu */}
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Environments</p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {sources.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No environments connected</p>
            )}
            {sources.map((ds) => (
              <button
                key={ds.id}
                onClick={() => { setActiveEnv(ds); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
              >
                <span className="text-base shrink-0">{vendorIcon(ds)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{ds.name}</p>
                  <p className="text-[10px] text-muted-foreground">{vendorLabel(ds)}</p>
                </div>
                {ds.id === active?.id && <CheckCircle2 size={13} className="text-primary shrink-0" />}

              </button>
            ))}
          </div>
          <div className="border-t border-border">
            <button
              onClick={() => { setOpen(false); navigate("/datasources"); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <ArrowRight size={13} />
              View All Environments
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-colors group"
      >
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-sm">
          {active ? vendorIcon(active) : <Database size={14} className="text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">
            {active?.name ?? "No environment"}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {active ? vendorLabel(active) : "Connect one to get started"}
          </p>
        </div>
        <ChevronUp
          size={14}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

function PlaceholderPage({ title, subtitle }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6 p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground text-sm">
        Coming soon
      </div>
    </div>
  );
}
