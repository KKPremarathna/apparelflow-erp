import { useEffect, useState } from "react";
import { api } from "./lib/api";

import SupervisorWorkspace from "./components/SupervisorWorkspace";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const data = await api("/auth/me", {
          signal: controller.signal,
        });
        setUser(data.user);
      } catch (err) {
        if (err.name === "AbortError") return;

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

  async function handleLogin(event) {
    event.preventDefault();
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setError("");
    setBusy(true);

    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setPassword("");
    } catch (err) {
      // An already-expired session should return to login.
      if (err.status === 401) {
        setUser(null);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="container">
        <p role="status">Checking session...</p>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="container">
        <h1>ApparelFlow</h1>
        <p role="alert" className="error">
          Unable to check session: {sessionError}
        </p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>ApparelFlow</h1>
      <p>Cutting Verification & Sewing Queue</p>

      {user ? (
        <section className="panel">
          <h2>Welcome, {user.fullName}</h2>
          <p>Email: {user.email}</p>
          <p>Role: {user.role}</p>

          {user.role === "cutting_supervisor" ? (
            <SupervisorWorkspace key={user.id} />
          ) : (
            <p>Your role workspace will be added next.</p>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button onClick={handleLogout} disabled={busy}>
            {busy ? "Please wait..." : "Logout"}
          </button>
        </section>
      ) : (
        <section className="panel">
          <h2>Login</h2>

          <form onSubmit={handleLogin}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              required
            />

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy}>
              {busy ? "Logging in..." : "Login"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}