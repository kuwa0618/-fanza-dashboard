# Netlify移転用の検証ブランチ（本番切替前）

既存Vercel環境を変更せずに移転先で試せる追加構成です。本番移転・アカウント作成・有料化は行っていません。

## 保持する機能

- 既存の検索、セール、新作、VR、作品詳細のAPIとHTML生成
- クリック記録、お気に入り、各ランキング、投稿ログ・分析
- 管理ページと管理APIのBasic認証。管理HTMLは公開ファイルに含めない
- 公開ページのメタ情報、構造化データ、サイトマップの新URLへの置換

Netlify FunctionsのRequest/Responseと既存APIのreq/resをアダプターで接続します。既存のAPI処理と画面はそのまま使用します。共有SEO設定に任意の `SITE_URL` を追加し、未指定時のVercelの既存URLは維持します。

## 設定と検証

1. 移転候補のNetlifyアカウント・サイトを用意する。契約同意と公開は別途判断する。
2. `SITE_URL` に割り当てられたHTTPSのオリジンを設定する（末尾のパスや認証情報は不可）。ビルド時とFunctions実行時の両方で必要。
3. 既存の `DMM_API_ID`, `DMM_AFFILIATE_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, 必要なら `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SITE_VERIFICATION`, `ADMIN_USER`, `ADMIN_PASSWORD` をFunctions環境変数として設定する。秘密値をGitや公開ファイルへ入れない。
4. `node --test tests/netlify-recovery.test.mjs` でモック接続の検証。`SITE_URL=https://新しいサイトのホスト名 node scripts/build-netlify.mjs` で公開ファイルを生成する。
5. Netlifyの実行環境で検索・ランキング・Supabaseへの記録・全管理ページ認証・Xカードを確認してから切替を判断する。未認証API/ページと `/.netlify/functions/site` への直接アクセスも確認する。
6. 切替時にGitHubのリポジトリ変数 `SITE_URL` を新しいオリジンへ設定する。定期サイトマップ更新の取得・検証・PR作成が新URLを使う。未設定時は従来のVercel URLのまま。
7. DMMの登録サイト、Xプロフィール・既存の紹介先、Search Console、GA4のドメイン設定を確認する。ブラウザ内のお気に入り・履歴は別オリジンへ自動移行されない。

## 費用と利用条件：確認済みと未確認を分ける

2026-10-17確認。Netlify公式は無料プランの商用利用を認める。公式フォーラムの運営側回答（2019年）は米国で合法な成人向けコンテンツを許容する。現行のSelf-Serve契約とAUPでは違法・権利侵害等を禁止し、成人向け全般の禁止は確認されなかった。これは本サイトに対する個別承認ではない。

無料枠は月300クレジット。本番デプロイ15、通信1GBあたり20、Webリクエスト1万あたり2、Compute 1GB-hourあたり10。無料枠を使い切ると停止する。永久無料・無停止・現在の利用量が枠内と保証するものではない。プレビューやブランチデプロイを本番の代替にして制限を回避しない。

- https://www.netlify.com/guides/netlify-vs-vercel/
- https://www.netlify.com/pricing/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- https://answers.netlify.com/t/hosting-adult-18-content-on-netlify/2612
- https://www.netlify.com/pdf/self-serve-subscription-agreement.pdf
- https://www.netlify.com/legal/acceptable-use-policy/

## 残る未検証事項

実アカウントへのデプロイ、バンドルの実行環境でのファイル解決、実API・DBの接続、実使用量、プレビューへのアクセス制御、個別の掲載可否。ローカルのモック試験合格はこれらの代わりにならない。現在の `vercel.app` のURLは別サービスへ移管できない。移転しても既存リンクの変更・旧URLからの誘導が別途必要。

## 既存機能の移転対応表

|機能|維持方法|
|---|---|
|キーワード・出演者・メーカー・ジャンル検索、並び替え、ページ送り、入力候補|既存app.jsと検索APIを使用|
|セール・新作・VR・おすすめ・関連作品・各ランキング|既存の全12 APIと画面生成を接続|
|年齢確認、お気に入り、閲覧履歴|既存ブラウザコードをコピー。旧URLの保存データは自動では新URLへ移らない|
|画像・ボタンからの誘導、GA4、クリック元別DB記録|既存app.js/catalog.jsとclick APIを維持|
|作品詳細、検索条件付きリンクとコピー、スマホ表示|既存HTML生成・JS・CSSを使用|
|投稿登録、投稿ログ、分析、クリック分析|既存APIと管理HTML、全管理経路の認証を適用|
|OGP、Xカード、構造化データ、robots、sitemap|元画像をコピー、公開先URLを置換|
|定期サイトマップ検証・更新提案|既存workflowを保持、SITE_URL変数を取得・検証・提案の全段階へ適用|
|問い合わせ、プライバシー、免責|既存公開HTMLをコピー|
