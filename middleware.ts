import { next, rewrite } from "@vercel/functions";
import { adminHeaders, isAdminAuthorized } from "./lib/admin-auth.js";

export const config = {
  matcher: [
    "/",
    "/sale",
    "/vr",
    "/new",
    "/product/:path*",
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
  const category = ({ "/sale": "sale", "/vr": "vr", "/new": "new" } as Record<string, string>)[url.pathname];
  if (category) {
    const publicFilters = new URL(url.href).searchParams;
    for (const name of [...publicFilters.keys()]) {
      if (!["actress", "genre", "maker"].includes(name)) publicFilters.delete(name);
    }
    url.pathname = "/api/search";
    url.search = publicFilters.toString();
    url.searchParams.set("view", "catalog");
    url.searchParams.set("category", category);
    return rewrite(url);
  }
  if (url.pathname === "/product" || url.pathname.startsWith("/product/")) {
    const match = url.pathname.match(/^\/product\/([a-zA-Z0-9_]{3,80})(\/?)$/);
    if (!match) return new Response("作品が見つかりません。", {status:404,headers:{"X-Robots-Tag":"noindex, follow","Cache-Control":"no-store"}});
    if (match[2]) {url.pathname = "/product/" + match[1];return Response.redirect(url,308);}
    url.pathname = "/api/search";
    url.search = "";
    url.searchParams.set("view", "product");
    url.searchParams.set("id", match[1]);
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
