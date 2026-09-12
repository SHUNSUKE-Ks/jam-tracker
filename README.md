# TOOL05_JamTracker

itch.io のジャム情報を集めて保存する。**ここまでが仕事。** 通知も画面も持たない。
使う側（ゲームの企画）はローカルで `git pull` してファイルを読む。

```
npm run try      テスト。選んだ一覧を出すだけで保存しない
npm run scrape   取得して保存（Actions も同じ）
npm run verify   固定HTMLで読み取りを確かめ、保存ファイルの形を確かめる。ネットに出ない
```

## 開発環境ごとのリスト

`config.json` の `lists` に1つ足せばリストが増える。いまは2つ。

| リスト | 保存先 | 条件 | 上限 |
|---|---|---|---|
| HTML（SolidJS・ブラウザ） | `data/jams_html.json` | 過去10日以内に開始・締切まで10日以上 | 10件 |
| Unity（2D・システム重視） | `data/jams_unity.json` | これから30日以内に始まる or 過去30日以内に開始・締切まで7日以上 | 20件 |

- `tags.like`（好き）に当たったものが先に並び、`tags.dislike`（嫌い）に当たったものは外す
- `words`（語）・`patterns`（正規表現）を題名と説明文に当てる。`maxChars` は説明文がその字数未満なら当たる（説明文なし）
- `pins` に `itch:スラッグ` を書くと、条件や嫌いタグに関わらず必ず残る（出ると決めたジャム用）
- 外したものは Summary に理由つきで出る。誤って外れていたら `words` を直す
- 詳細ページを読む件数は全体で `maxCandidates` 件まで。リストから1件ずつ交互に取るので、参加者の少ないリストも残る

## 1件の中身

| 項目 | 意味 |
|---|---|
| `id` | `itch:スラッグ`。サイトをまたいで重ならない |
| `env` | どのリストで拾ったか（`html` / `unity`） |
| `title` `url` | 名前とページ |
| `start_time` `end_time` `voting_end_time` | UTC |
| `status` | `upcoming` / `running` / `voting` / `ended`（保存した時点） |
| `joined` `entries` | 参加者数・投稿数 |
| `theme` | 説明文の「Theme: 〇〇」からの**推定**。未発表・見つからなければ `null` |
| `description` | 説明文の先頭4000字。テーマやルールは結局ここを読む |
| `tags` | 当たった好きタグ。`参加予定` は `pins` で残したもの |
| `first_seen_at` `detail_fetched_at` | 初めて見た日・詳細を取った日 |

## 取り方

- 一覧は `https://itch.io/jams` に埋め込まれた JSON を読む（1リクエスト）
- 詳細ページは3秒おき（1.5秒では 429 が返った）。同じジャムは1回だけ読む
- 前回までに拾ったものは残す。投票終了から60日経ったジャムは消す
- robots.txt で `/jams` `/jam/` は禁止されていない（2026-09-11 確認）。利用規約は未確認

## GitHub 側の設定

- `.github/workflows/scrape.yml` が毎月 1・11・21日 00:00 JST に動く。手動実行も可（既定はテスト）
- Settings → Actions → General → Workflow permissions を「Read and write」にする
