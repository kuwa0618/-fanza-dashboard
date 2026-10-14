import { next, rewrite } from "@vercel/functions";
import { adminHeaders, isAdminAuthorized } from "./lib/admin-auth.js";

export const config = {
  matcher: [
    "/",
    "/click-analysis.html",
    "/click-analysis.html/:path*",
    "/click-analysis/:path*",
    "/analysis",
    "/post-form",
    "/dashboard",
    "/analysis.html",
    "/post-form.html",
    "/dashboard.html",
    "/api/post",
    "/api/posts",
    "/api/insights",
    "/api/stats",
  ],
};

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/") {
    url.pathname = "/api/search";
    url.searchParams.set("view", "page");
    return rewrite(url);
  }
  const headers = { ...adminHeaders };
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return new Response("管理用の認証設定がありません。", { status: 503, headers });
  }
  if (isAdminAuthorized(request.headers.get("authorization"))) {
    return next({ headers });
  }
  return new Response("管理者のユーザー名とパスワードを入力してください。", {
    status: 401,
    headers: { ...headers, "WWW-Authenticate": 'Basic realm="FANZA Admin", charset="UTF-8"' },
  });
}
