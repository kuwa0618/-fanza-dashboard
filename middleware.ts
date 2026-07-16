import { next } from "@vercel/functions";

export const config = {
  matcher: [
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
  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPassword) {
    return new Response("管理用の認証設定がありません。", {
      status: 500,
    });
  }

  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = atob(authorization.slice(6));
      const separator = decoded.indexOf(":");

      const username = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);

      if (
        username === adminUser &&
        password === adminPassword
      ) {
        return next();
      }
    } catch {
      // 認証に失敗した場合は下の401を返す
    }
  }

  return new Response("ユーザー名とパスワードを入力してください。", {
    status: 401,
    headers: {
      "WWW-Authenticate":
        'Basic realm="FANZA Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
