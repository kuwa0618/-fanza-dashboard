# 作品別サイトマップ

`/sitemap.xml` は既存7ページと、公開サイト上で検証できた作品詳細を最大20件掲載する静的XML。初回は27URL。架空の更新日時は付けず、重複・管理画面・API・検索パラメータを含めない。

## 更新

```sh
npm run sitemap:check
npm run sitemap:refresh
node --test tests/*.test.mjs
git diff -- sitemap.xml
```

`sitemap:check` はローカルXMLの形式・URL・件数を確認し、通信しない。`sitemap:refresh` は本番の既存7ページを取得し、セール・VR・新作の初期HTMLに実際にある詳細リンクを抽出する。前回の掲載作品をすべて先に再検証し、残りのチェック上限で新しい候補も検証する。作品のHTTP 200、HTML、自己参照canonical、noindexでないこと、H1、要求IDと埋め込み作品データの完全一致、カテゴリ等へ戻る内部リンクを確認してから採用する。リダイレクトは追跡しない。404・IDやcanonicalが異なる作品は除外する。再検証できた既存作品を優先して維持し、404等で無効になった既存作品の空き枠だけを新しい検証済み候補で補う。

7ページの検証失敗、候補なし、正常な作品ゼロ、XML不正の場合は失敗として終了し、既存ファイルを維持する。作品の503等の5xx・429・401/403・通信失敗も全体を中止し、一時障害による大量削除案を作らない。全体の検証完了後に同一ディレクトリの一時ファイルからrenameし、途中までのXMLを公開しない。URL集合が変わらない場合は順番だけの違いでも書き換えない。

1回の更新は直列、リクエスト間隔1.2秒、1件8秒で打ち切り、詳細チェック最大30件・合計最大37リクエスト。上限まで全件がタイムアウトしても待機を含め約340秒以内（通常はそれより短い）。カテゴリの取得結果を再利用し、DMM APIの一覧を余分に直接取得しない。サイトマップ配信時のAPI呼び出しはゼロ、API関数は既存12個のまま。ビルド時・アクセス時の更新やVercel Cronは追加しない。

手元での明示的なコマンド実行も可能。既存スナップショットが将来の配信停止まで保証するものではないため、作品の入れ替え時にも再検証する。全作品の網羅や毎日の自動追加はこの実装の対象外。

## GitHub Actionsによる週次の更新案

- `.github/workflows/weekly-sitemap.yml`：毎週月曜06:17 JST（UTC日曜21:17、`17 21 * * 0`）。GitHubの混雑等で実行が遅れる場合がある。
- `schedule` / 手動の `workflow_dispatch` は、対象リポジトリのmainだけで実行。ジョブ上限10分、作品取得ステップ6分、PR投稿2分。同時実行を直列化し、リトライや日次処理は追加しない。
- 固定SHAの公式checkout/setup-nodeとNode 24を利用。`npm ci --ignore-scripts` → 回帰テスト → 再検証 → XML検証 → PR提案の順。失敗すれば後続の書き込みを行わない。
- URL集合の差分がある場合だけ `scripts/propose-sitemap.mjs` が専用 `automation/verified-sitemap` ブランチへ `sitemap.xml` だけを反映し、main向けPRを作成。既存のbot PRは再利用し、同一の案なら追加コミットもしない。
- mainのSHAが検証中に変わっていたら中止。専用ブランチに手動編集があれば上書きしない。既存ブランチの更新はfast-forwardのみでforce pushしない。
- **自動承認・自動マージ・mainへの直接書き込みはない。最終確認とマージは管理者が行う。** マージ前の案は本番サイトマップに影響しない。
- 権限は週次提案ジョブの `contents: write` / `pull-requests: write` のみ。既定は読み取り。トークンはPR投稿ステップだけの環境変数で渡し、秘密鍵・DMM/Supabase/Vercelの認証情報は使わない。APIエラー本文やヘッダーはログへ出さない。
- GitHub側で「Allow GitHub Actions to create and approve pull requests」が必要。設定上は承認も許可されるが、このコードに承認処理はない。
- PR用の `validate` ジョブは読み取り権限だけでテストし、提案処理は動かさない。実装ブランチ `weekly-sitemap-automation` の同一リポジトリPRでは実サイトの再検証も行い、ファイル差分だけをログに出す。結果はPRやmainへ公開しない。

### 有効化と運用確認

ワークフローはmainへマージされた後に週次登録と手動実行が有効になる。実装PRも管理者がマージする。マージ後、Actionsの「Weekly verified product sitemap」→「Run workflow」→mainで初回実行し、各ステップと作成された更新案PRを確認する。差分なしならPRは作られない。失敗時はログを確認し、原因解消後に手動再実行する。

公開リポジトリのスケジュールは長期間リポジトリに活動がないとGitHub側で停止する場合がある。Actions画面で有効状態を確認する。恒久的な実行保証やGitHubの料金・上限の変更への追従を保証するものではない。

## 公開後

- 本番 `/sitemap.xml` がHTTP 200、XMLで配信され、検証したファイルと一致することを確認する。
- 掲載URLのHTTP 200、作品ID、自己参照canonical、内部リンクを再確認する。
- 既存のSearch Consoleプロパティで同じ `sitemap.xml` の読み込みと検出URL数を確認。代表作品をURL検査し、Googleの選択canonicalとインデックス状況を確認する。検索掲載や順位向上は公開確認だけでは判定できない。
- 価格・画像・抽出条件・計測・GA4・年齢確認・管理認証のコードは変更しない。

参考: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=ja

## 2026-10-26 URL移転後の修正

週次処理の対象は、公開復旧先 `https://fanza-works-navi-recovery.orange-rose-6867.chatgpt.site` に固定する。停止中のNetlifyを指すリポジトリ変数 `SITE_URL` は、このワークフローでは参照しない。次に移転する際はワークフローの `SITEMAP_SITE_URL` も変更する。

保存済みXMLに限り、既知のVercel・Netlify・公開復旧先のいずれか1ホストを認める。混在ホスト・外部ホスト・不正なパスは拒否する。旧URLはパスを取り出すためだけに読み、更新先で全公開ページ・作品を従来通り検証する。失敗時は元のXMLをそのまま維持する。生成結果とPRへ書くXMLは、常に更新先ホストの厳密検証を通す。

PRのオフライン検査は `npm run sitemap:check -- --stored` で保存済みホストを検査する。実サイト再検証後の検査は通常の `sitemap:check` で更新先との一致を検査する。自動マージ・自動デプロイは追加しない。GitHub側のXML更新をマージしても、別リポジトリのSitesへ自動配信されるわけではないため、公開復旧先の配信反映は別途必要。
