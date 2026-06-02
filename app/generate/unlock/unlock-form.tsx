"use client";

import { useState } from "react";
import styles from "./unlock.module.css";

export function UnlockForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, next: nextPath }),
      });
      const json = (await res.json()) as { ok?: boolean; redirectTo?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Noe gikk galt");
        return;
      }
      // Full-page navigation rather than router.push: the unlock cookie was
      // just set on this response, but the client router's RSC cache may
      // already be holding the redirected page's content from an earlier
      // unauth visit. A real navigation makes the browser send the new
      // cookie and the middleware see the fresh state.
      window.location.assign(json.redirectTo ?? "/generate");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <label className={styles.field}>
        <span>Passord</span>
        <input
          autoFocus
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </label>
      <button type="submit" className={styles.submit} disabled={submitting || !password}>
        {submitting ? "Sjekker…" : "Lås opp"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
