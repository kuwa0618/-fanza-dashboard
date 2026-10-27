# Deno移転の準備状況（2026-10-24）

現在のNetlify公開停止を解除できたという記録ではない。Denoアカウント・アプリ・本番公開は未作成。管理画面を開く操作は自動承認審査で拒否され、Denoを指定した移転再開の承認が必要とされた。別経路での回避は行わない。

## 準備済みコード

`deno task start` で既存サイトの同じサーバーハンドラーを起動する。検索、各ランキング、おすすめ、セール、新作、VR、作品詳細、管理画面/API、クリック・お気に入り記録を維持する。静的ファイルは許可リストのみ。公開GET成功応答のみ最大128件・4MiB・個別512KiBのプロセス内キャッシュに置く。全URLクエリとUser-Agentを分離し、管理・認証・書き込み・エラー・Twitterbotは対象外。

Deno専用CDNヘッダーを設定し、ブラウザーのno-storeを維持したまま公開データを短時間共有する。ローカルキャッシュから返す際は残存TTLだけを渡し、鮮度を延長しない。静的ファイルはCDN1時間。新デプロイ時はDeno標準の自動破棄を利用し、Deno-Cache-Idは付けない。CDN HITは実公開後にCache-Statusで検証が必要。

## 検証

Deno 2.8.3実行環境で56ルート確認に成功。検索条件、0件、障害、管理認証、キャッシュHIT/期限/追い出し、残存CDN TTL、2回のDB向け書き込み、秘密ファイルの非公開を確認。外部APIはモック。本物のDMM/Supabase接続、本番CDN、CPU・メモリー消費は未検証。

## 無料枠と限界

公式料金表2026-10-24確認: 月100万HTTP要求、送信20GiB、active CPU10時間、memory time150GiB-hr。768MBをアプリがロードされた秒数で消費し、アイドル時は約20〜30秒で停止する。無料枠超過時は次期までアプリが停止する。無制限でも継続公開の保証でもない。キャッシュは処理を減らすが、無料枠への適合は実測を要する。既存の大量アクセスが続いた場合、同様に停止し得る。

AUPにSSR・DB/API接続・企業サイト・ECの許容例がある。これは成人向けアフィリエイトサイトについて個別の承認を得たことを意味しない。新規アカウントの規約同意とGitHub権限は必要時に確認し、有料プラン・カード登録は行わない。

## 公開前に必要な設定

DenoアカウントとFree組織の確認、対象リポジトリのみへの連携、実際に割り当てられたURLをSITE_URLに設定。DMM_API_ID、DMM_AFFILIATE_ID、SUPABASE_URL、SUPABASE_ANON_KEY、ADMIN_USER、ADMIN_PASSWORDおよび使用中の任意秘密値はサーバー側環境変数に移す。値をGitHub・本文・ログに書かない。アクセス元の既存認証値を取得できたとは主張しない。

実公開後に作品表示、記録、管理認証とCDNを確認してから移転完了とする。URL変更時、旧オリジンのlocalStorageお気に入り・履歴は自動移行されない。Netlify停止中は旧URLから転送できない。

公式情報:
- https://deno.com/deploy/pricing
- https://docs.deno.com/deploy/acceptable_use_policy/
- https://docs.deno.com/deploy/changelog/
- https://docs.deno.com/deploy/reference/caching/
- https://docs.deno.com/deploy/terms_and_conditions/
