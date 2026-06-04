/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  turbopack: {
    // required in git worktrees if nested inside the main repo, otherwise next selects the main (outer) repo as the root
    root: import.meta.dirname,
  },
  async rewrites() {
    // Slidev builds into public/slides/. Next.js serves files in public/ at
    // their exact path (so /slides/assets/foo.js works as a static file), but
    // does NOT auto-resolve /slides or /slides/ to /slides/index.html. These
    // rewrites do that for the SPA entry plus its history-mode sub-routes
    // (e.g. /slides/1, /slides/2). Asset paths still hit the static handler
    // first (rewrites run in afterFiles), so they don't get swallowed.
    return [
      { source: '/slides', destination: '/slides/index.html' },
      { source: '/slides/:path*', destination: '/slides/index.html' },
    ];
  },
};

export default nextConfig;
