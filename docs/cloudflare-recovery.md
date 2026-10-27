# Cloudflareへの復旧準備（まだ本番公開していない）

## 検証済みの範囲

2026-10-24時点。既存のおすすめ、検索、ランキング、セール、新作、VR、詳細、管理画面、クリック・お気に入り記録、GA4、年齢確認、OGP、サイトマップを同じコードで動かす移植版。

既存Nodeテスト85件が成功。Cloudflareのworkerd実行エンジンを使うMiniflareで55のルート確認が成功。検索結果の区別、真の0件、障害503、管理認証、HTMLテンプレート読み込み、静的アセット、キャッシュHIT、DB向け書き込み2回を検証した。外部APIはテストデータに置き換え、実際のDMM/Supabaseには接続していない。ローカルの55回で本番CPU制限や実トラフィックへの適合を保証するものではない。

Wrangler 4.152.0のdry-runで171.54 KiB / gzip 37.35 KiBのWorkerと、許可リストの公開アセットを生成できた。管理HTMLは非公開WorkerのTextモジュールであり、アセットとしては公開しない。テンプレート注入方式にして、Nodeの作業ディレクトリに依存するファイル読み込みを避ける。NetlifyとVercelの動作は従来のデフォルトを維持する。

## 利用条件と無料枠

確認した公式ページ:

- https://www.cloudflare.com/terms/
- https://www.cloudflare.com/service-specific-terms-developer-platform/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

公開規約には合法な成人向け紹介サイト全般や商用利用を一律に禁ずる条項は見つからなかった。ただし個別サイトへの利用承認を得たという意味ではない。違法・権利侵害・搾取その他有害なコンテンツの禁止と停止裁量はある。紹介画像は従来どおり許可されたDMM等の配信元を参照し、動画本体のホスティングは追加しない。

FreeはWorker実行リクエスト10万回/日、CPU時間10ms/実行。日次枠はUTC 0時（日本時間9時）にリセット。超過時に動的処理は停止し得る。静的アセットの直接配信は無料・回数無制限。ただしWorkerを先に動かす設定ではそのリクエストは動的枠を使うため、CSS/JS/画像はアセットを先に配信する。動的HTML・APIは枠内で処理する。無料で停止しないという保証はしない。

Netlifyの約8.2万件/日の総リクエストはCloudflareの動的リクエストとは同じ測定ではない。月単位の処理時間消費がなくなるだけで、制限が消えるわけではない。Cache APIのHITでもWorkerリクエスト自体は消費し、主にDMM/Supabase呼び出しとCPU負荷を減らす。Cache APIはデータセンターごとで、全地域共通キャッシュではない。

## 公開前に必要なこと

1. ユーザー所有Cloudflareアカウントへサインインし、Workers Freeのままであることを確認。契約同意・GitHubアプリ権限の新規付与はユーザーによる操作/確認が必要。
2. 公開先の正確なURLを確定する。`SITE_URL`はビルド時と実行時の両方で同じHTTPSオリジンに設定する。テストのmigration.exampleは公開先として使用しない。
3. 現在の設定値を正しいプロジェクトへ移す。DMM_API_ID、DMM_AFFILIATE_ID、SUPABASE_URL、SUPABASE_ANON_KEY、ADMIN_USER、ADMIN_PASSWORD。既存設定にSUPABASE_SERVICE_ROLE_KEY、GOOGLE_SITE_VERIFICATIONがある場合は用途を確認して保持する。秘密値はGitHub・公開アセット・チャットに書かず、Cloudflareのsecretに設定する。
4. ビルド: `npm ci`後、正しいSITE_URLで`npm run cloudflare:build`。dry-runは`npm run cloudflare:dry-run`。本番アップロードは課金プランを変更せずユーザーのアカウントに行う。
5. 少数の本番要求でDMM接続、Supabase記録、管理認証、年齢ゲート、GA4、各画面の操作、OGP/canonical/robots/sitemapの新URLを検証。管理APIや秘密ファイルを匿名で取得できないことを確認する。
6. 本番MetricsでCPU時間・エラー・日次要求数を確認。CPU上限に達する処理があれば修正してから切り替える。検証未完了のURLをXや相互リンク先に案内しない。

Netlifyの旧URL停止や既存オリジンのlocalStorageは新ホストから制御できない。お気に入り・閲覧履歴は同じブラウザーの別オリジンへ自動移行されない。停止中の旧URLからの自動リダイレクトも現段階では設定できていない。

## キャッシュと認証

公開GETの成功だけを60秒（公開HTMLは既存TTL）保存し、フルクエリを保持する。管理画面/API、認証付き要求、Twitterbot専用応答、書き込み、エラーを共有しない。キャッシュの不調が正常なページ表示を妨げないようにする。ブラウザーへ返すCache-Controlは元のポリシーを維持する。デバッグ用`X-Site-Cache`にHIT/MISS/BYPASSを表示する。実本番のキャッシュ挙動は公開後に別途確認が必要。
