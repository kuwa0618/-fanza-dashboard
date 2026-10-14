# SEO設定とGoogle Search Consoleの確認手順

対象: https://fanza-dashboard-omega.vercel.app/

## 実装

- robots.txt: 公開ページとJS/CSS/公開検索APIはクロール可能。管理画面・管理APIは除外。robotsはアクセス制御ではないため、既存のBasic認証とHTTP `X-Robots-Tag: noindex, nofollow, noarchive` を維持。
- sitemap.xml: 200を返す公開ページ7URLのみ。管理ページ、API、出演者検索パラメータ、ハッシュは含めない。根拠のないlastmodは付けない。
- 正規URL: トップは末尾 `/`。`/index.html` と `/index` は恒久リダイレクト。公開情報3ページは自己参照canonical。出演者パラメータは検索バリエーションとしてトップに統合し、個別の検索流入ページとは扱わない。
- 初期HTML: Routing Middlewareで静的index.htmlより前に `/` を既存 `/api/search?view=page` に内部転送。DMM APIの新着20件の実データをサーバーで取得し、可視の作品名・メーカー・配信日・出演者検索リンクとItemListを出力。クローラーと利用者で出し分けない。秘密鍵や管理データは含めない。API関数の数は増やさない。
- 初期作品欄は通常の検索結果が取得できた後に削除し、作品の二重表示を防止。外部FANZAリンクは従来どおりクライアントで表示・計測する。SSRの出演者リンクはサイト内検索へのリンク。
- 作品取得は5秒で打ち切り。失敗時もサイト紹介と通常の検索UIを表示し、JS側で再取得する。架空の作品やレビューは出さない。成功した初期HTMLは共有キャッシュ5分、更新中の古い応答は最大10分。失敗時のキャッシュは30秒。
- JSON-LD: WebSite / CollectionPage / 実データのItemList（CreativeWork）。販売者・価格保証・架空評価・動画自社配信・存在しない作品詳細URLは記載しない。Googleのリッチリザルト表示を保証するものではない。
- 成人向けページは `rating=adult` と `isFamilyFriendly=false`。年齢確認は維持し、Googlebotを名乗るだけで解除する仕組みは導入しない。
- タイトル・説明・H1はサイト名と作品検索の内容に統一。年齢確認はH2。検索フォームにはH2、ページ全体には1つのmainを付け、閉じ忘れのランキングsectionも修正。

## 登録の準備

1. サイト管理者のGoogleアカウントで https://search.google.com/search-console/ を開く。
2. **URLプレフィックス**を選び `https://fanza-dashboard-omega.vercel.app/` を登録する。`vercel.app` の親ドメインDNSは所有していないため、ドメインプロパティは選ばない。
3. 所有権確認で「HTMLタグ」を選択。表示されたmetaタグの **content属性の値だけ** を、Vercelプロジェクト `fanza-dashboard` の環境変数 `GOOGLE_SITE_VERIFICATION` にProduction対象で設定する。偽の値や他サイトの値を使わない。共有チャットに認証情報を貼る必要はない。
4. 本番を再デプロイする。トップページの**元のHTMLソース**に `google-site-verification` が1つあり、Search Consoleの値と一致することを確認する。
5. Search Consoleで「確認」。確認後も環境変数を削除しない。
6. 「サイトマップ」に `sitemap.xml` を送信。取得成功と検出URL数（7件）を確認する。登録済みプロパティがあれば新規作成せず既存のものを使う。

## インデックス確認

- URL検査にトップURLを入力し「公開URLをテスト」。HTTP 200、クロール許可、Google選択canonicalを確認。
- 「テスト済みのページを表示」のHTMLで `initialCatalog` と実在する作品名、canonical、構造化データを検索する。スクリーンショットも確認し、年齢確認がGoogleの認識を妨げていないかを調べる。取得内容・索引登録の可否をこのテストなしで断定しない。
- 年齢確認を維持しているため、Google公式が推奨する「検証済みGooglebotへの年齢確認なし配信」は未実装。必要なら利用者の年齢確認を維持した設計を別途検討する。User-Agent文字列だけを信用して解除しない。
- 公開ページの取得が正常なら「インデックス登録をリクエスト」。ページのインデックス登録レポート、検索パフォーマンスの表示回数・クリック・検索語を後日確認。即時掲載や順位上昇は保証されない。
- 管理画面 /click-analysis.html と管理API /api/stats?view=click-analysis は未認証で401、no-store、X-Robots-Tagが返ることを確認。検索除外はrobotsだけに頼らない。
- https://validator.schema.org/ ではWebSite / CollectionPage / ItemListの構文を確認できる。Google Rich Results Testで対象のリッチリザルトがないことは、この基本スキーマの構文エラーを意味しない。

## 残る課題

- トップページのインデックス登録と既存4URLのサイトマップ正常処理は管理者が確認済み。追加3ページのURL検査・インデックス状況は公開後にSearch Consoleで確認する。
- 作品詳細は /product/<content_id> に追加済み。出演者の独立した詳細ページは未実装。作品単位の動的サイトマップは未追加で、カテゴリから内部リンクする。パラメータや#リンクを大量にサイトマップへ追加しない。
- トップに掲載する情報はAPI依存。検索流入を継続して増やすには、作品詳細の固有情報の充実と出演者ページの整備、パフォーマンス測定と改善が次の課題。
- 成人向けサイトのため、SafeSearchによる表示制限がある。動画ファイルを自サイトで配信していないので動画サイトマップは作成しない。

## 公式資料

- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=ja
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=ja
- https://developers.google.com/search/docs/specialty/explicit/guidelines
- https://support.google.com/webmasters/answer/9008080?hl=ja


## セール・VR・新作の公開ページ（2026-10-15追加）

- `/sale`：APIの人気順上位100件から、同一配信形式で販売価格が通常価格より安い作品を最大20件表示。範囲表記など正確な価格を読み取れないものは掲載条件に使わない。全セール作品を網羅するページではない。
- `/vr`：APIのVRキーワード検索結果（新着上位100件）から、ジャンル名にVRが含まれる作品を最大20件表示。タイトルだけで判定しない。
- `/new`：日本時間の今日を含む30日間の配信作品を新着順に最大20件表示。未来の配信日や不明な日付は除外。
- 各ページは独立したタイトル・説明・H1・自己参照canonical・CollectionPage/ItemList/BreadcrumbListを初期HTMLに出力。作品情報とSSRリンクはクローラー・利用者で共通。成人向け指定と既存の年齢確認を維持し、確認前はmainをinertにして操作を抑止する。
- FANZAリンクは既存の`/api/click`へ記録。掲載場所に` sale_page / vr_page / new_page `を追加し、管理分析に日本語ラベルを表示。既存のtextカラムを利用するのでDB変更は不要。閲覧履歴もトップページと共通。
- 取得成功時は共有キャッシュ5分・更新中の古い応答最大10分。API失敗時は503/no-store/Retry-Afterで一時障害を知らせ、架空の作品や評価は表示しない。
- トップとカテゴリ間に内部リンクを設定。API関数を追加せず既存search関数を再利用し、管理ルートの認証を維持。
- トップのインデックス登録・既存4URLのサイトマップ処理は管理者が確認済み（2026-10-15の申告）。公開後は既存Search Consoleプロパティでsitemap.xmlを再送信し、7URLの取得状況を確認。`/sale`・`/vr`・`/new`をURL検査→公開URLテスト→初期HTML/自己参照canonical確認→インデックス登録リクエスト。新ページのGoogle側インデックス登録は公開テストだけでは断定しない。
