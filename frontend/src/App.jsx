import { useEffect, useState } from "react";
import { supabase } from "./services/supabaseClient";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, currentSession) => {
        setSession(currentSession);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const credentials = { email: email.trim(), password };

      const { data, error } = isSignup
        ? await supabase.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: window.location.origin,
            },
          })
        : await supabase.auth.signInWithPassword(credentials);

      if (error) throw error;

      setPassword("");

      if (isSignup && !data.session) {
        setMessage(
          "Check your email for a confirmation link, then return to log in."
        );
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Loading your session...</p>;

  return (
    <main className={session ? "card dashboard" : "card"}>
      <header className="app-header"><a className="brand" href="#"><span className="brand-icon">C<span>↗</span></span><span>Campus<span className="brand-light"> Digital Twin</span><small>CAREER POINT UNIVERSITY · KOTA</small></span></a><span className="header-tag">Your campus, connected.</span></header>

      {session ? (
  <section>
    <div className="account-bar"><span><span className="status-dot" /> Campus workspace</span><span className="account-email">{session.user.email}</span>

    <button onClick={handleLogout} disabled={busy}>
      {busy ? "Please wait..." : "Log out"}
    </button>

    </div>
    <Dashboard
      key={session.user.id}
      userId={session.user.id}
    />
  </section>
) : (
        <section>
          <div className="auth-intro"><span className="eyebrow">WELCOME TO YOUR CAMPUS</span><h2>{isSignup ? "Your journey starts here." : "A smarter way to campus."}</h2><p>Find your next classroom, discover what’s happening, and get there with confidence.</p></div><h3>{isSignup ? "Create your account" : "Welcome back"}</h3>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />

            <button type="submit" disabled={busy}>
              {busy ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
            </button>
          </form>

          <button
            className="switch-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setIsSignup(!isSignup);
              setMessage("");
            }}
          >
            {isSignup
              ? "Already have an account? Log in"
              : "New here? Create an account"}
          </button>
        </section>
      )}

      <p role="status">{message}</p>
    </main>
  );
}