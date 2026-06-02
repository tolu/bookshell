import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", margin: "0 0 1rem" }}>
        Fant ikke utgivelsen
      </h1>
      <p style={{ color: "var(--shell-muted)", fontSize: "1.1rem" }}>
        Denne utgivelsen finnes ikke, eller er ikke publisert ennå.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/releases" style={{ color: "var(--shell-brand)", fontWeight: 500 }}>
          ← Se alle utgivelser
        </Link>
      </p>
    </main>
  );
}
