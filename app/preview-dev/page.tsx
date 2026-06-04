import { notFound } from "next/navigation";
import { PreviewDevHarness } from "./PreviewDevHarness";

// Gate the streaming-iframe test harness on a server-side env var so it never
// ships to real production deployments. The Playwright preview server sets
// ENABLE_PREVIEW_DEV=1; `next dev` users can opt in via .env.local.
//
// force-dynamic prevents Next from prerendering this at build time — without
// it, the gate's outcome is baked into the build, and the runtime env var
// has no effect on subsequent requests.
export const dynamic = "force-dynamic";

export default function PreviewDevPage() {
  if (process.env.NODE_ENV !== "development" && !process.env.ENABLE_PREVIEW_DEV) {
    notFound();
  }
  return <PreviewDevHarness />;
}
