import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Layers,
  LogOut,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";

/**
 * Corex-style shell: dark sidebar + light main area.
 */
export function AppShell({
  activeView,
  onNavigate,
  instrumentSymbol,
  niftyFutLtp,
  niftyFutChange,
  onLogout,
  children,
}) {
  const navItem = (view, Icon, label) => (
    <button
      type="button"
      className={`app-shell-nav-item ${activeView === view ? "app-shell-nav-item--active" : ""}`}
      onClick={() => onNavigate(view)}
    >
      <Icon size={18} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar" aria-label="Main navigation">
        <div className="app-shell-brand">
          <span className="app-shell-brand-mark" aria-hidden>
            <TrendingUp size={14} className="app-shell-brand-up" />
            <TrendingDown size={14} className="app-shell-brand-down" />
          </span>
          <span className="app-shell-brand-text">Four Walls Trading</span>
        </div>

        <nav className="app-shell-nav">
          <p className="app-shell-nav-group">Main menu</p>
          {navItem("oi", LayoutDashboard, "Dashboard")}

          <p className="app-shell-nav-group">Trading</p>
          {navItem("strategy", Layers, "Options")}

          <p className="app-shell-nav-group">Analysis</p>
          <button type="button" className="app-shell-nav-item app-shell-nav-item--disabled" disabled>
            <BarChart3 size={18} strokeWidth={2} aria-hidden />
            <span>Analytics</span>
          </button>
        </nav>

        <div className="app-shell-footer">
          <div className="app-shell-user">
            <span className="app-shell-user-avatar" aria-hidden>
              <User size={18} strokeWidth={2} />
            </span>
            <div className="app-shell-user-meta">
              <span className="app-shell-user-name">Trader</span>
              <span className="app-shell-user-role">Upstox</span>
            </div>
          </div>
          <button type="button" className="app-shell-signout" onClick={onLogout}>
            <LogOut size={16} strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-shell-main">
        <header className="app-shell-topbar">
          <div className="app-shell-topbar-spacer" />
          <div className="app-shell-topbar-right">
            {instrumentSymbol ? (
              <span className="app-shell-symbol">{instrumentSymbol}</span>
            ) : null}
            {niftyFutLtp != null && (
              <span className="app-shell-ltp" title="NIFTY future last traded price">
                <span className="app-shell-ltp-label">LTP</span>
                {niftyFutLtp.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {niftyFutChange != null && (
                  <span
                    className={
                      niftyFutChange >= 0 ? "app-shell-ltp-chg app-shell-ltp-chg--up" : "app-shell-ltp-chg app-shell-ltp-chg--down"
                    }
                  >
                    {niftyFutChange >= 0 ? "+" : ""}
                    {niftyFutChange.toFixed(2)}
                  </span>
                )}
              </span>
            )}
            <button type="button" className="app-shell-bell" aria-label="Notifications">
              <Bell size={20} strokeWidth={2} />
              <span className="app-shell-bell-badge">8</span>
            </button>
          </div>
        </header>

        <div className="app-shell-body">{children}</div>
      </div>
    </div>
  );
}
