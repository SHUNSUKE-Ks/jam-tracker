# TOOL05_JamTracker

itch.io のジャム情報を毎日集めて `data/jams.json` に保存する。**ここまでが仕事。** 通知も画面も持たない。
使う側（ゲームの企画）はローカルで `git pull` して `data/jams.json` を読む。

```
npm run try      テスト。選んだ一覧を出すだけで保存しない
npm run scrape   取得して data/jams.json を更新（Actions も同じ）
npm run verify   固定HTMLで読み取りを確かめ、jams.json の形を確かめる。ネットに出ない
```

**選び方は `config.json` だけで変える。** いまは「過去10日以内に開始・締切まで10日以上・参加の多い順に最大10件」。
実行が10日おきなので、前回から今回までに始まったジャムがちょうど拾える。

`tags.like`（好き）に当たったものは先に並び、`tags.dislike`（嫌い）に当たったものは外す。
`words`（語）・`patterns`（正規表現）を題名と説明文に当てる。`maxChars` は説明文がその字数未満なら当たる（説明文なし）。外したものは Summary の「外したもの」に理由つきで出るので、
誤って外れていたら `words` を直す。ジャンルは運用しながら足していく。

Actions の手動実行（Run workflow）は既定でテスト。一覧は実行結果ページの Summary に出る。
保存したいときは「テスト」のチェックを外して実行する。

## 1件の中身

| 項目 | 意味 |
|---|---|
| `id` | `itch:スラッグ`。サイトをまたいで重ならない |
| `title` `url` | 名前とページ |
| `start_time` `end_time` `voting_end_time` | UTC |
| `status` | `upcoming` / `running` / `voting` / `ended`（保存した時点） |
| `joined` `entries` | 参加者数・投稿数 |
| `theme` | 説明文の「Theme: 〇〇」行からの**推定**。未発表・見つからなければ `null` |
| `description` | 説明文の先頭2000字。テーマやルールは結局ここを読む |
| `first_seen_at` `detail_fetched_at` | 初めて見た日・詳細を取った日 |

## 取り方

- 一覧は `https://itch.io/jams` に埋め込まれた JSON を読む（1リクエスト）
- 選んだ最大10件だけ詳細ページを読む。3秒おき（1.5秒では 429 が返った）
- 前回までに拾ったものは残す。投票終了から60日経ったジャムは消す
- robots.txt で `/jams` `/jam/` は禁止されていない（2026-09-11 確認）。利用規約は未確認

## GitHub 側の設定

- `.github/workflows/scrape.yml` が毎月 1・11・21日 00:00 JST に動く。手動実行も可
- Settings → Actions → General → Workflow permissions を「Read and write」にする（ワークフロー側でも `contents: write` を書いてある）
