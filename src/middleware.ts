import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PAGES = [
  "/dashboard",
  "/forms",
  "/submissions",
  "/settings",
  "/onboarding",
];
const PROTECTED_API = [
  "/api/orgs",
  "/api/forms",
  "/api/submissions",
  "/api/invites",
  "/api/uploads",
  "/api/billing/checkout",
  "/api/billing/portal",
  // /api/billing/webhook intentionally NOT here — Stripe calls it
  // server-to-server with its own signature auth.
];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          res.cookies.set(name, value, options);
        }
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPage = PROTECTED_PAGES.some((p) => path.startsWith(p));
  const isApi = PROTECTED_API.some((p) => path.startsWith(p));

  if (!user && isPage) {
    const redirect = req.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }
  if (!user && isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
