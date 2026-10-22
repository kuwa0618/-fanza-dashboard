# 障害時の確認と、X投稿別のサイト集客計測

## 今回の変更

- 検索APIは5秒で上流への待機を中断する。HTMLのメンテナンス画面、不正なJSON、失敗応答、items欠落は503・no-store・Retry-After: 60で返す。正常な空配列は200の0件として区別する。
- ブラウザーの検索・おすすめ・セール・ランキングは12秒の待機上限を持つ。検索失敗は件数「—」と再検索案内を表示し、検索ボタンを戻す。取得先のエラー本文はHTMLへ挿入しない。
- ランキングを取得できない場合と、作品情報を取得できない場合を空白にしない。範囲価格を数字だけで連結しない。
- お気に入り・履歴の価格は「保存時の参考価格」とし、保存済みのセールタグを現行のセールとして表示しない。

## 自分の動作確認を記録しない

確認開始時に `/?internal_test=1` を開く。同じタブで移動する間はGA4とSupabaseの作品クリック記録を停止する。お気に入り・履歴など画面の動作自体は維持する。画面上部に動作確認モードの表示が出る。

解除は `/?internal_test=0` または表示内の「通常の計測に戻す」。sessionStorageを使うため、新しい独立したタブでは改めて確認モードに入る。ストレージを使用できない環境では、同一タブ内の持続は保証できない。

このモードは過去の数値を削除・補正するものではない。APIの直接呼び出しや、URLにフラグを付けずに行う通常の閲覧を除外するものでもない。利用者のオプトアウトであり、認証・アクセス制御の代用にはしない。

Google公式の実装方法： https://developers.google.com/tag-platform/security/guides/privacy?hl=ja

## 投稿別の集客を区別する

既存のGA4タグでUTMを読み取れる。次のリンクは用途を分けた案であり、Xプロフィールや投稿は自動変更しない。

| 用途 | リンク |
| --- | --- |
| プロフィール | https://fanza-works-navi.netlify.app/?utm_source=x&utm_medium=social&utm_campaign=site_guide_20261022&utm_content=profile |
| サイトの使い方紹介 | https://fanza-works-navi.netlify.app/?utm_source=x&utm_medium=social&utm_campaign=site_guide_20261022&utm_content=guide_01 |
| セール一覧の紹介 | https://fanza-works-navi.netlify.app/sale?utm_source=x&utm_medium=social&utm_campaign=site_guide_20261022&utm_content=sale_01 |

投稿ごとにutm_contentを変える。内部リンクにUTMを付け直して流入元を上書きしない。GA4では同期間・同ホストに絞り、セッションのキャンペーン／手動広告コンテンツ別に、ユーザー数・ページ閲覧・fanza_clickを見る。テスト時はinternal_test=1を併記し、顧客の訪問として送らない。

クリック回数は固有の訪問者数や購入数ではない。Supabaseの現在のclick_logsにはセッション流入元がないため、過去のクリックをX投稿へ後付けで帰属させない。

Google公式： https://support.google.com/analytics/answer/11242841?hl=ja

## 動作検証

`node --test tests/*.test.mjs`。追加テストは、メンテナンスHTML・不正JSON・正常0件、タイムアウト、検索UIの復帰、内部確認の継続と解除、GA4／Supabase両方へのクリック記録抑止、タグ読込順、ランキングエラーと価格範囲を確認する。
