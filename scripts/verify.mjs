// npm run verify: 固定HTMLで読み取りを確かめ、data/jams.json の形を確かめる。ネットには出ない
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseList, parseDetail, findTheme } from '../src/itch.mjs';
import { load, merge } from '../src/store.mjs';
import { candidates, applyTags, matchTags } from '../src/pick.mjs';

const fx = (f) => readFileSync(new URL(`../tests/fixtures/${f}`, import.meta.url), 'utf8');
let n = 0;
const check = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

check('一覧: JSONを読める', () => {
  const list = parseList(fx('list.html'));
  assert.ok(list.length > 100);
  const gb = list.find((j) => j.id === 'itch:gbjam-14');
  assert.equal(gb.start_time, '2026-09-11T11:00:00Z');
  assert.equal(gb.url, 'https://itch.io/jam/gbjam-14');
});

check('一覧: 締切はUTC（カウントダウン表示と一致）', () => {
  const hawk = parseList(fx('list.html')).find((j) => j.id === 'itch:hawktoberhorrors2026');
  assert.equal(hawk.end_time, '2026-10-03T05:59:59Z');
});

check('詳細: 説明文と投稿数', () => {
  const d = parseDetail(fx('jam_hawk.html'));
  assert.ok(d.description.length > 100);
  assert.equal(d.entries, 37);
});

check('詳細: 未発表のテーマは null', () => {
  assert.equal(parseDetail(fx('jam_gbjam.html')).theme, null);
});

check('テーマ抽出', () => {
  assert.equal(findTheme('Welcome!\nThe theme is "Love is Blind".'), 'Love is Blind');
  assert.equal(findTheme('Theme: Tiny World'), 'Tiny World');
  assert.equal(findTheme('The theme will be announced at the start'), null);
  assert.equal(findTheme('Theme: TBA'), null);
  assert.equal(findTheme('Theme: 🍯🐝Honey'), '🍯🐝Honey');
  // 2026-09-11 の実データで拾ってしまった誤検出
  assert.equal(findTheme('The theme is revealed'), null);
  assert.equal(findTheme('Theme: TBC, at the start of the jam'), null);
  assert.equal(findTheme('Theme: completely up to you'), null);
  assert.equal(findTheme('Theme - How well did the game follow the theme?'), null);
  assert.equal(findTheme('Theme: Freedom, but at what cost?'), 'Freedom, but at what cost?');
  assert.equal(findTheme('Theme: required'), null);
  assert.equal(findTheme('Kaidan Nights\nGame Theme: Japanese Urban Legends'), 'Japanese Urban Legends');
  assert.equal(findTheme('The theme will revealed at the start.\nTHEME\n"unstoppable"\nRULES\nThe theme is required.'), 'unstoppable');
  assert.equal(findTheme('Theme Adherence:\nYour game must fit'), null);
  assert.equal(findTheme('The theme is a suggestion to inspire creativity and give us all something to work with'), null);
  assert.equal(findTheme('We keep the theme secret until the start. The theme is announced at the start to ensure no one cheats by starting their game early'), null);
});

check('突き合わせ: 前回分を残し、初見日は変えない', () => {
  const a = { id: 'itch:a', title: 'A', joined: 1, start_time: '2026-09-01T00:00:00Z', end_time: '2026-12-01T00:00:00Z', voting_end_time: null, first_seen_at: '2026-09-01T00:00:00Z' };
  const old = { id: 'itch:old', title: 'Old', joined: 9, start_time: '2026-01-01T00:00:00Z', end_time: '2026-01-10T00:00:00Z', voting_end_time: '2026-01-20T00:00:00Z' };
  const gone = { ...old, id: 'itch:gone', voting_end_time: '2026-06-01T00:00:00Z' };
  const out = merge([a, { ...old, voting_end_time: '2026-08-01T00:00:00Z' }, gone], [{ ...a, joined: 50, first_seen_at: undefined }], '2026-09-11T00:00:00Z');
  const got = Object.fromEntries(out.map((j) => [j.id, j]));
  assert.equal(got['itch:a'].joined, 50);
  assert.equal(got['itch:a'].first_seen_at, '2026-09-01T00:00:00Z');
  assert.equal(got['itch:a'].status, 'running');
  assert.equal(got['itch:old'].status, 'ended');
  assert.ok(!got['itch:gone'], '投票終了から60日を過ぎたものは消える');
});

check('候補: 過去10日に開始・締切まで10日以上・参加の多い順', () => {
  const j = (id, start, end, joined) => ({ id, start_time: start, end_time: end, joined });
  const listed = [
    j('old', '2026-08-20T00:00:00Z', '2026-09-30T00:00:00Z', 999), // 10日より前に開始
    j('future', '2026-09-15T00:00:00Z', '2026-09-30T00:00:00Z', 999), // まだ始まっていない
    j('soon', '2026-09-05T00:00:00Z', '2026-09-15T00:00:00Z', 999), // 残り4日
    j('a', '2026-09-05T00:00:00Z', '2026-09-25T00:00:00Z', 10),
    j('b', '2026-09-08T00:00:00Z', '2026-09-25T00:00:00Z', 300),
    j('c', '2026-09-10T00:00:00Z', '2026-09-21T00:00:00Z', 50), // 残りちょうど10日
  ];
  const cfg = { startedWithinDays: 10, minDaysLeft: 10, minJoined: 0, maxCandidates: 25 };
  assert.deepEqual(candidates(listed, cfg, '2026-09-11T00:00:00Z').map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(candidates(listed, { ...cfg, minJoined: 20, maxCandidates: 1 }, '2026-09-11T00:00:00Z').map((x) => x.id), ['b']);
});

check('タグ: 好きは先に、嫌いは外す。語単位で当てる', () => {
  const tags = {
    like: [{ name: 'ブラウザ', words: ['browser'] }],
    dislike: [{ name: 'AI禁止', words: ['no ai'] }, { name: '音楽', words: ['noise jam'] }],
  };
  assert.deepEqual(matchTags('There is no aim here', tags.dislike), []); // "no ai" は "no aim" に当たらない
  assert.deepEqual(matchTags('Rules: No AI.', tags.dislike), ['AI禁止']);

  // 実際の config.json の AI禁止（2026-09-11 に語だけでは取りこぼした言い回し）
  const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  const ai = cfg.tags.dislike.filter((t) => t.name === 'AI禁止');
  for (const s of [
    '7) AI-generated assets are not allowed.',
    'The use of AI for games in this jam is not allowed.',
    '• AI-generated assets are not permitted',
    'No AI-generated content.',
  ]) assert.deepEqual(matchTags(s, ai), ['AI禁止'], s);
  assert.deepEqual(matchTags('You are allowed to generate assets and ideas with AI, but you must declare them.', ai), []);
  const jams = [
    { id: 'big', title: 'Big Jam', joined: 900, description: 'Rules: NO AI!' },
    { id: 'mid', title: 'Mid Jam', joined: 500, description: 'make a game' },
    { id: 'web', title: 'Web Jam', joined: 100, description: 'Browser builds recommended' },
    { id: 'noise', title: 'NOISE JAM 4', joined: 800, description: null },
  ];
  const { picked, excluded } = applyTags(jams, tags, 10);
  assert.deepEqual(picked.map((x) => x.id), ['web', 'mid']);
  assert.deepEqual(picked[0].tags, ['ブラウザ']);
  assert.deepEqual(excluded.map((x) => [x.id, x.excluded_by]), [['big', ['AI禁止']], ['noise', ['音楽']]]);
});

check('data/jams.json の形', () => {
  const jams = load(new URL('../data/jams.json', import.meta.url));
  const ids = new Set();
  for (const j of jams) {
    assert.match(j.id, /^[a-z]+:.+/, j.id);
    assert.ok(!ids.has(j.id), `id重複 ${j.id}`);
    ids.add(j.id);
    for (const k of ['title', 'url', 'start_time', 'end_time', 'status']) assert.ok(j[k], `${j.id} に ${k} が無い`);
    assert.ok(['upcoming', 'running', 'voting', 'ended'].includes(j.status));
  }
});

console.log(`\n${n}件すべて通過`);
