import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import logoDark from "../assets/logo-dark.png";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/catalogue";
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <img src={logoDark} alt="DGP" className="w-10 h-10 rounded-xl shrink-0 object-cover" />
          <div>
            <p className="font-bold text-foreground text-base leading-tight">DGP</p>
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">Open Data Governance and Compliance</p>
          </div>
        </div>

        {/* Card */}
        <div className="card space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                autoFocus
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="your-username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertCircle size={14} className="text-destructive shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !form.username || !form.password}
              className="btn-primary w-full justify-center py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
