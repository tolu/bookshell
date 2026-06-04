import { defineAppSetup } from '@slidev/types'

// Workaround for a Slidev v52 nav bug when deployed under a sub-path
// (e.g. --base /slides/). useNav.go() calls
//
//     router.push({ path: getSlidePath(no, ...) })
//
// and getSlidePath returns `${import.meta.env.BASE_URL}${no}` — i.e. it
// includes the base. Vue Router's `createWebHistory(base)` then prepends
// the base AGAIN, producing `/slides/slides/2` URLs that don't match any
// slide route. The slide matcher inside the SPA only knows about `/<no>`.
//
// beforeEach catches the double-prefixed paths and rewrites them back to
// the SPA-internal form. Clean redirect — Vue Router cancels the original
// navigation and runs the corrected one, no intermediate URL is shown.
//
// File a follow-up upstream and drop this once they fix getSlidePath to
// return a base-relative path.
const DOUBLE_BASE_RE = /^\/slides\/(\d+|presenter\/\d+|export\/\d+|overview)$/

export default defineAppSetup(({ router }) => {
  router.beforeEach((to) => {
    const m = DOUBLE_BASE_RE.exec(to.path)
    if (m) return { path: `/${m[1]}`, replace: true }
  })
})
