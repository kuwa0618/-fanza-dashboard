# Netlify利用上限停止の調査と再発防止案

## 管理画面で確認した事実

対象: FANZA品ナビ / fanza-works-navi。請求期間: 2026-10-17〜11-16。
Freeプラン、残高0、カード登録なし、プロジェクト停止中。

Usage & billing の Credit usage breakdown:

| 項目 | 表示値 |
| --- | --- |
| Production deploys | 4回 / 60 credits |
| Compute | 245 credits |
| Web requests | 84,322件 / 16.9 credits |
| Bandwidth | 8.4 credits |
| AI inference | 0 credits |
| Total | 330.3 credits |

別画面Account usage insightsの日別グラフでは10月22日に約82K requests、Functions compute 237 credits / 約24 GB-Hrsを表示。グラフ側の期間合計は293 creditsで、上記残高画面の330.3とは不一致。日別グラフを厳密な請求内訳とは扱わず、数値の差の理由は未確定とする。

Functionは `site` 1本。トップ、カテゴリ、作品詳細、公開API、管理画面を処理する。ログ保存期間は24時間と画面に表示され、10月22日の詳細アクセスを現在のログから追跡できない。通常訪問・ボット・反復処理・検証アクセスの寄与率は不明。リクエスト件数を訪問者数と呼ばない。

## コード上の改善点と変更

公開JSON検索・ランキングは、従来アクセスのたびにDMM/Supabaseを呼び出していた。Netlifyアダプターに公開GET成功応答のみの `Netlify-CDN-Cache-Control: public, durable, max-age=60` を追加する。検索語・並び順・ページ位置・期間を含む全クエリはキャッシュキーに保持する。ブラウザー側のCache-Control設定は維持する。

既存の公開HTMLのs-maxage設定にはNetlifyのdurableキャッシュを追加する。Twitterbotのprivate/no-store応答とVary: User-Agentは維持する。管理画面、管理API、認証付き要求、書き込み、エラー応答は新しい共有キャッシュの対象外。

この変更は不要な再実行を抑えるための対策であり、今回の大量アクセスの原因を特定したものではない。60秒間は以前の検索結果・ランキングを表示し得る。任意のクエリを大量に変えられた場合やキャッシュ不整合、障害応答は別の対策が必要で、無料枠内の継続を保証しない。

## 停止解除と公開後の確認

キャッシュ変更では消費済みクレジットは戻らない。無料枠の通常回復は次の請求期間。有料変更、カード登録、新チームによる枠の迂回は実施していない。

本番停止中のためCDNヒット率の実測は未完了。復旧後、同じ公開GET URLでCache-StatusにNetlify Durable/Edgeのhitが出ること、別クエリは別データになること、管理認証・クリック/お気に入りPOSTが共有されないことを確認する。大規模なアクセス試験はしない。1日単位のcomputeとrequestsを比較し、効果を判断する。

参考: https://docs.netlify.com/build/caching/caching-overview/
https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/
