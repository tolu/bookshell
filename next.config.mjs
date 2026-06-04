/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  turbopack: {
    // required in git worktrees if nested inside the main repo, otherwise next selects the main (outer) repo as the root
    root: import.meta.dirname,
  },
};

export default nextConfig;
