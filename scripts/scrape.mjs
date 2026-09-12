// 入口。`npm run scrape` で保存、`npm run try` は選ぶだけで保存しない（テスト用）
// config.json の lists ごとに選び、それぞれのファイルへ保存する。詳細ページは重複を除いて1回だけ読む
import { readFileSync, appendFileSync } from 'node:fs';
import * as itch from '../src/itch.mjs';
import { candidates, applyTags } from '../src/pick.mjs';
import { load, save, merge } from '../src/store.mjs';

const CONFIG = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const INTERVAL_MS = 3000; // 1.5秒では 60件目あたりから 429 が返った（2026-09-11 実測）
const dry = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const listed = itch.parseList(await itch.fetchList());

// リストごとの候補を集める。同じジャムは1つにまとめ、詳細は1回だけ読む
const byId = new Map();
const perList = CONFIG.lists.map((list) => {
  const ids = [];
  // リストごとに枠を分ける（全体で切ると、参加者の少ないリストが先に落ちる）
  for (const j of candidates(listed, list, nowIso).slice(0, list.maxCandidates ?? list.max * 3)) {
    if (!byId.has(j.id)) byId.set(j.id, j);
    ids.push(j.id);
  }
  for (const id of list.pins ?? []) {
    const j = listed.find((x) => x.id === id);
    if (j) { if (!byId.has(id)) byId.set(id, j); if (!ids.includes(id)) ids.unshift(id); }
  }
  return { list, ids };
});
// リストから1件ずつ交互に取る。全体の上限で切っても、どのリストも上から順に残る
const targets = [];
const seen = new Set();
const queues = perList.map(({ ids }) => ids.slice());
while (targets.length < CONFIG.maxCandidates && queues.some((q) => q.length)) {
  for (const q of queues) {
    while (q.length) {
      const id = q.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      targets.push(byId.get(id));
      break;
    }
    if (targets.length >= CONFIG.maxCandidates) break;
  }
}

let failed = 0;
for (const j of targets) {
  await sleep(INTERVAL_MS);
  try {
    Object.assign(j, itch.parseDetail(await itch.fetchDetail(j.url)), { detail_fetched_at: nowIso });
  } catch (e) {
    failed++;
    console.error(`詳細の取得に失敗: ${j.id} ${e.message}`);
  }
}

const jst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
const days = (iso) => Math.round((Date.parse(iso) - Date.parse(nowIso)) / 864e5);
const link = (j) => `[${j.title.replace(/\|/g, '/')}](${j.url})`;
const out = [`## ${dry ? 'テスト（保存しない）' : '保存'} — 一覧 ${listed.length}件 / 詳細を読んだ ${targets.length}件`];

for (const { list, ids } of perList) {
  const jams = ids.map((id) => byId.get(id)).filter((j) => j.detail_fetched_at);
  const { picked, excluded } = applyTags(jams, list.tags, list.max);
  // pins（出ると決めたジャム）は条件や嫌いタグに関わらず必ず残す
  const pinned = (list.pins ?? []).map((id) => byId.get(id)).filter((j) => j?.detail_fetched_at).map((j) => ({ ...j, tags: ['参加予定'] }));
  const pinnedIds = new Set(pinned.map((j) => j.id));
  const rows = [...pinned, ...picked.filter((j) => !pinnedIds.has(j.id))];
  const dropped = excluded.filter((j) => !pinnedIds.has(j.id));
  const file = new URL(`../${list.file}`, import.meta.url);
  if (!dry) save(file, merge(load(file), rows.map((j) => ({ ...j, env: list.name })), nowIso));
  out.push(
    '',
    `### ${list.label}: ${rows.length}件（候補 ${jams.length}件 / 上限 ${list.max}件 + 参加予定 ${pinned.length}件）`,
    `条件: ${list.startsWithinDays ? `これから${list.startsWithinDays}日以内に始まるか、` : ''}過去${list.startedWithinDays}日以内に開始・締切まで${list.minDaysLeft}日以上`,
    '',
    '| # | ジャム | 開始(JST) | 締切(JST) | 残り | 参加 | テーマ | 好きタグ |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((j, i) => `| ${i + 1} | ${link(j)} | ${jst(j.start_time)} | ${jst(j.end_time)} | ${days(j.end_time)}日 | ${j.joined} | ${j.theme ?? '—'} | ${j.tags.join(', ') || '—'} |`),
    '',
    dropped.length ? `外したもの: ${dropped.map((j) => `${j.title}（${j.excluded_by.join(', ')}）`).join(' / ')}` : '外したもの: なし',
  );
}

const summary = out.join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
if (targets.length && failed === targets.length) process.exit(1); // 全部落ちたら構造変化を疑って Actions を赤にする
