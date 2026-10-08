import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import SupervisorWorkspace from "./components/SupervisorWorkspace";
import VerifierWorkspace from "./components/VerifierWorkspace";
import SewingWorkspace from "./components/SewingWorkspace";
import MyActivity from "./components/MyActivity";
import "./index.css";
import "./DemoCredentials.css";

const ROLE_DETAILS = {
  cutting_supervisor: {
    label: "Cutting Supervisor",
    title: "Cutting Workspace",
    description: "Manage production orders and prepare cutting batches.",
    component: SupervisorWorkspace,
  },
  cutting_verifier: {
    label: "Cutting Verifier",
    title: "Verification Workspace",
    description: "Review cutting batches and verify component quantities.",
    component: VerifierWorkspace,
  },
  sewing_supervisor: {
    label: "Sewing Supervisor",
    title: "Sewing Workspace",
    description: "Manage verified batches in the sewing queue.",
    component: SewingWorkspace,
  },
};

const DEMO_PASSWORD = "Demo@12345";

const DEMO_ACCOUNTS = [
  {
    role: "cutting_supervisor",
    label: "Cutting Supervisor",
    email: "supervisor@apparelflow.demo",
    description: "Create cutting orders and resubmit rejected batches.",
    number: "01",
  },
  {
    role: "cutting_verifier",
    label: "Cutting Verifier",
    email: "verifier@apparelflow.demo",
    description: "Count components, review QC, and approve or reject batches.",
    number: "02",
  },
  {
    role: "sewing_supervisor",
    label: "Sewing Supervisor",
    email: "sewing@apparelflow.demo",
    description: "Review verified batches and start sewing assembly.",
    number: "03",
  },
];

function Icon({ name, ...props }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2.6 7" />
        <path d="M3 4v7h7" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H4V3h5" />
        <path d="M10 12h11m-4-4 4 4-4 4" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  };

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.grid}
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        AF
      </span>

      <div>
        <span className="brand-name">ApparelFlow</span>
        <span className="brand-subtitle">
          Production workspace
        </span>
      </div>
    </div>
  );
}

function DemoCredentialsPanel({
  selectedRole,
  busy,
  onSelect,
}) {
  return (
    <section
      className="demo-panel"
      aria-labelledby="demo-panel-title"
    >
      <div className="demo-panel-heading">
        <span className="demo-panel-badge">
          EVALUATOR ACCESS
        </span>

        <h2 id="demo-panel-title">
          Explore all three roles
        </h2>

        <p>
          Choose a demo account to fill the login form, then
          click Sign in.
        </p>
      </div>

      <div className="demo-account-list">
        {DEMO_ACCOUNTS.map((account) => {
          const selected = selectedRole === account.role;

          return (
            <article
              key={account.role}
              className={`demo-account-card ${
                selected ? "demo-account-selected" : ""
              }`}
            >
              <div className="demo-account-heading">
                <span
                  className="demo-account-number"
                  aria-hidden="true"
                >
                  {account.number}
                </span>

                <div>
                  <h3>{account.label}</h3>
                  <p>{account.description}</p>
                </div>
              </div>

              <dl className="demo-account-credentials">
                <div>
                  <dt>Email</dt>
                  <dd>{account.email}</dd>
                </div>

                <div>
                  <dt>Password</dt>
                  <dd>
                    <code>{DEMO_PASSWORD}</code>
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                className="demo-use-button"
                disabled={busy}
                aria-label={`Use ${account.label} demo credentials`}
                onClick={() => onSelect(account)}
              >
                {selected
                  ? "Use credentials again"
                  : "Use credentials"}

                <Icon name="arrow" />
              </button>
            </article>
          );
        })}
      </div>

      <p className="demo-panel-note">
        Public demo accounts for evaluation. 
      </p>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activePage, setActivePage] = useState("workspace");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState("");
  const [demoNotice, setDemoNotice] = useState("");

  const signInButtonRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const data = await api("/auth/me", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setUser(data.user);
        }
      } catch (err) {
        if (
          controller.signal.aborted ||
          err.name === "AbortError"
        ) {
          return;
        }

        if (err.status !== 401) {
          setSessionError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
        }
      }
    }

    checkSession();

    return () => controller.abort();
  }, []);

  function handleDemoSelect(account) {
    if (busy) return;

    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError("");
    setSelectedDemoRole(account.role);
    setDemoNotice(
      `${account.label} credentials filled. Click Sign in to continue.`
    );

    signInButtonRef.current?.focus();
  }

  function handleEmailChange(event) {
    setEmail(event.target.value);
    setSelectedDemoRole("");
    setDemoNotice("");
    setError("");
  }

  function handlePasswordChange(event) {
    setPassword(event.target.value);
    setSelectedDemoRole("");
    setDemoNotice("");
    setError("");
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (busy) return;

    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setBusy(true);

    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: {
          email: email.trim(),
          password,
        },
      });

      setUser(data.user);
      setPassword("");
      setActivePage("workspace");
      setSelectedDemoRole("");
      setDemoNotice("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (busy) return;

    setError("");
    setBusy(true);

    try {
      await api("/auth/logout", {
        method: "POST",
      });

      setUser(null);
      setEmail("");
      setPassword("");
      setActivePage("workspace");
      setSelectedDemoRole("");
      setDemoNotice("");
    } catch (err) {
      if (err.status === 401) {
        setUser(null);
        setEmail("");
        setPassword("");
        setActivePage("workspace");
        setSelectedDemoRole("");
        setDemoNotice("");
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <Brand />

          <p className="muted" role="status">
            Checking your session…
          </p>
        </section>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <Brand />

          <h1>Unable to connect</h1>

          <p className="error" role="alert">
            Unable to check session: {sessionError}
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Retry connection
          </button>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-page">
        <div className="demo-auth-layout">
          <section
            className="auth-card demo-login-card"
            aria-labelledby="login-title"
          >
            <Brand />

            <div className="auth-heading">
              <p className="eyebrow">
                PRODUCTION OPERATIONS
              </p>

              <h1 id="login-title">Welcome back.</h1>

              <p className="muted">
                Sign in to your ApparelFlow workspace.
              </p>
            </div>

            <form
              className="login-form"
              onSubmit={handleLogin}
              aria-busy={busy}
            >
              <div className="form-field">
                <label htmlFor="email">
                  Email address
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="Enter your email"
                  value={email}
                  onChange={handleEmailChange}
                  disabled={busy}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="password">
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={handlePasswordChange}
                  disabled={busy}
                  required
                />
              </div>

              {demoNotice && (
                <p
                  className="demo-login-notice"
                  role="status"
                  aria-live="polite"
                >
                  {demoNotice}
                </p>
              )}

              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}

              <button
                ref={signInButtonRef}
                className="login-submit"
                type="submit"
                disabled={busy}
              >
                {busy ? "Signing in…" : "Sign in"}
                {!busy && <Icon name="arrow" />}
              </button>
            </form>

            <p className="auth-footer">
              Cutting verification &amp; sewing queue management
            </p>
          </section>

          <DemoCredentialsPanel
            selectedRole={selectedDemoRole}
            busy={busy}
            onSelect={handleDemoSelect}
          />
        </div>
      </main>
    );
  }

  const roleDetails = ROLE_DETAILS[user.role];
  const Workspace = roleDetails?.component;
  const displayName = user.fullName || user.email || "User";

  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={`app-shell ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside
        className="sidebar"
        aria-label="Application sidebar"
      >
        <Brand />

        <p className="nav-caption">WORKSPACE</p>

        <nav
          className="sidebar-nav"
          aria-label="Main navigation"
        >
          <button
            type="button"
            className={`nav-item ${
              activePage === "workspace" ? "active" : ""
            }`}
            aria-current={
              activePage === "workspace" ? "page" : undefined
            }
            title="Workspace"
            onClick={() => setActivePage("workspace")}
          >
            <Icon name="grid" />
            <span className="nav-label">Workspace</span>
          </button>

          {roleDetails && (
            <button
              type="button"
              className={`nav-item ${
                activePage === "history" ? "active" : ""
              }`}
              aria-current={
                activePage === "history" ? "page" : undefined
              }
              title="My History"
              onClick={() => setActivePage("history")}
            >
              <Icon name="history" />
              <span className="nav-label">My History</span>
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="avatar">{initials}</span>

            <div className="user-details">
              <span className="user-name">
                {displayName}
              </span>

              <span className="user-role">
                {roleDetails?.label || user.role}
              </span>
            </div>
          </div>

          <button
            className="nav-item logout-button"
            type="button"
            title="Logout"
            onClick={handleLogout}
            disabled={busy}
          >
            <Icon name="logout" />

            <span className="nav-label">
              {busy ? "Please wait…" : "Logout"}
            </span>
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setSidebarCollapsed((value) => !value)
              }
              aria-label={
                sidebarCollapsed
                  ? "Expand sidebar"
                  : "Collapse sidebar"
              }
              aria-expanded={!sidebarCollapsed}
            >
              <Icon name="menu" />
            </button>

            <span className="topbar-label">
              Production /{" "}
              {activePage === "history"
                ? "My History"
                : "Workspace"}
            </span>
          </div>

          <span className="role-badge">
            {roleDetails?.label || user.role}
          </span>
        </header>

        <main
          id="main-content"
          className="workspace-content"
        >
          <div className="page-heading">
            <p className="eyebrow">
              APPARELFLOW / OPERATIONS
            </p>

            <h1>
              {activePage === "history"
                ? "My History"
                : roleDetails?.title || "Workspace"}
            </h1>

            <p className="muted">
              {activePage === "history"
                ? "Review your personal activity and previous actions."
                : roleDetails?.description ||
                  "Your account role is not supported."}
            </p>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {!roleDetails ? (
            <section className="panel">
              <p className="error" role="alert">
                Unsupported user role.
              </p>
            </section>
          ) : (
            <>
              <div hidden={activePage !== "workspace"}>
                <Workspace key={user.id} />
              </div>

              <div hidden={activePage !== "history"}>
                <MyActivity key={user.id} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}