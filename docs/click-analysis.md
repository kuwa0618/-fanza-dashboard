# 管理者専用クリック分析

- 本番URL: `/click-analysis.html`（既存の `ADMIN_USER` / `ADMIN_PASSWORD` によるBasic認証）
- API: `GET /api/click-analysis?days=7|30|90` または `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- middlewareでHTMLを保護し、APIでも独立して認証。認証設定がない場合も拒否します。
- 日別・作品別（上位50）・掲載場所別を日本時間で集計。最大90日、10万件。上限を超える場合はエラーを表示し、切り捨てた数値は表示しません。
- ページ/APIの応答は `private, no-store`。管理者情報・DB接続情報はサーバーの環境変数のみで管理します。ブラウザにDBキーを渡しません。
- DB接続は既存の `SUPABASE_URL` と `SUPABASE_ANON_KEY` を利用できます。サーバー専用の `SUPABASE_SERVICE_ROLE_KEY` が設定されていれば優先します。キーをGitHubに保存しないでください。

## DB変更

既存のSupabaseプロジェクトで `supabase/migrations/202610140001_click_tracking_source.sql` を実行してください。列を追加するだけで、既存レコードの削除や既存列・権限・RLSの変更は行いません。

- `link_source`: search / recommendation / sale / related / ranking / favorites / history / unknown
- `link_type`: image / button / unknown
- 古いクライアントや過去レコードの欠損値はunknownとして集計。
- DB反映前だけ、列不存在を明示するエラー時に限り、従来の形式で記録を再試行します。分析APIも旧形式の読み込みに切り替え、管理画面に未反映を表示します。
- タイムアウトやその他エラーで挿入を再試行しないため、通信不明時の二重記録を避けます。
- 公開の作品ランキングAPIには掲載場所や生ログを追加していません。

## 確認

`node --test tests/*.test.mjs`

本番では未認証アクセスの拒否、認証後の集計、作品画像とボタンのクリックが同じ掲載場所・異なる形式として記録されることを確認してください。
