// 入口。`npm run scrape` で保存、`npm run try` は選ぶだけで保存しない（テスト用）
// GitHub Actions でも同じ動きをし、選んだ一覧を実行結果のページ（Summary）に出す
import { readFileSync, appendFileSync } from 'node:fs';
import * as itch from '../src/itch.mjs';
import { candidates, applyTags } from '../src/pick.mjs';
import { load, save, merge } from '../src/store.mjs';

const DATA = new URL('../data/jams.json', import.meta.url);
const CONFIG = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const INTERVAL_MS = 3000; // 1.5秒では 60件目あたりから 429 が返った（2026-09-11 実測）
const dry = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const listed = itch.parseList(await itch.fetchList());
const cands = candidates(listed, CONFIG, nowIso);

// タグは説明文にも当てるので、候補の詳細を先に読む
let failed = 0;
for (const j of cands) {
  await sleep(INTERVAL_MS);
  try {
    Object.assign(j, itch.parseDetail(await itch.fetchDetail(j.url)), { detail_fetched_at: nowIso });
  } catch (e) {
    failed++;
    console.error(`詳細の取得に失敗: ${j.id} ${e.message}`);
  }
}
const { picked, excluded } = applyTags(cands, CONFIG.tags, CONFIG.max);

const jst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
const days = (iso) => Math.floor((Date.parse(iso) - Date.parse(nowIso)) / 864e5);
const name = (j) => `[${j.title.replace(/\|/g, '/')}](${j.url})`;
const summary = [
  `### ${dry ? 'テスト（保存しない）' : '保存'}: ${picked.length}件 / 候補 ${cands.length}件 / 一覧 ${listed.length}件`,
  `条件: 過去${CONFIG.startedWithinDays}日以内に開始・締切まで${CONFIG.minDaysLeft}日以上・参加${CONFIG.minJoined}人以上・最大${CONFIG.max}件`,
  '',
  '| # | ジャム | 締切(JST) | 残り | 参加 | テーマ（推定） | 好きタグ |',
  '|---|---|---|---|---|---|---|',
  ...picked.map((j, i) => `| ${i + 1} | ${name(j)} | ${jst(j.end_time)} | ${days(j.end_time)}日 | ${j.joined} | ${j.theme ?? '—'} | ${j.tags.join(', ') || '—'} |`),
  '',
  excluded.length ? `**外したもの**（嫌いタグ。誤りなら config.json の words を直す）` : '',
  ...excluded.map((j) => `- ${name(j)} … ${j.excluded_by.join(', ')}`),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');

if (!dry) save(DATA, merge(load(DATA), picked, nowIso));
if (cands.length && failed === cands.length) process.exit(1); // 全部落ちたら構造変化を疑って Actions を赤にする
