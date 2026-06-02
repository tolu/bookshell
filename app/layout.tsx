import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Elate Bok — leseglede og lærelyst",
    template: "%s | Elate Bok",
  },
  description:
    "Digital bokhandel og boksirkel. Oppdag nye utgivelser og forfattere.",
};

function Header() {
  return (
    <header className="shell-header">
      <div className="shell-header__inner">
        <Link href="/" className="shell-logo">
          Elate<span>·</span>Bok
        </Link>
        <nav className="shell-nav" aria-label="Hovedmeny">
          <Link href="/">Hjem</Link>
          <Link href="/releases">Utgivelser</Link>
          <Link href="/generate">Generer</Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="shell-footer">
      <div className="shell-footer__inner">
        <strong>Elate Bok</strong>
        <span>Bokhandel &amp; boksirkel</span>
        <span>Sehesteds gate 4, 0164 Oslo</span>
        <a href="mailto:hei@elatebok.no">hei@elatebok.no</a>
        <span style={{ marginInlineStart: "auto" }}>
          © {new Date().getFullYear()} Elate
        </span>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body>
        <Header />
        <div className="shell-main">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
