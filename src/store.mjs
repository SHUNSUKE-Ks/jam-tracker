// data/jams.json の読み書きと突き合わせ。1行1ジャムで書き、git の差分を読みやすくする
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const PRUNE_AFTER_DAYS = 60; // 投票が終わってこれだけ経ったら消す

export function load(path) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function save(path, jams) {
  const sorted = [...jams].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(path, sorted.length ? '[\n' + sorted.map((j) => JSON.stringify(j)).join(',\n') + '\n]\n' : '[]\n');
}

export function statusOf(j, now) {
  const t = (s) => (s ? Date.parse(s) : NaN);
  if (now < t(j.start_time)) return 'upcoming';
  if (now < t(j.end_time)) return 'running';
  if (now < t(j.voting_end_time)) return 'voting';
  return 'ended';
}

// 今回拾ったジャムを既存へ重ねる。前回拾ったものも残し、状態だけ付け直す
export function merge(old, picked, nowIso) {
  const now = Date.parse(nowIso);
  const out = new Map(old.map((j) => [j.id, j]));
  for (const p of picked) {
    const prev = out.get(p.id);
    out.set(p.id, { theme: null, description: null, entries: null, ...prev, ...p, first_seen_at: prev?.first_seen_at ?? nowIso });
  }
  for (const [id, j] of out) {
    j.status = statusOf(j, now);
    const end = Date.parse(j.voting_end_time ?? j.end_time);
    if (now - end > PRUNE_AFTER_DAYS * 864e5) out.delete(id);
  }
  return [...out.values()];
}
