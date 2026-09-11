// 拾うジャムを選ぶ。条件は config.json
// 1. 日付で候補を絞る（詳細を読む前）  2. 詳細を読んだ後にタグで並べ替え・除外する

// startedWithinDays: 過去N日以内に開始 / minDaysLeft: 締切まで残りN日以上 / minJoined: 参加者数の下限
export function candidates(listed, cfg, nowIso) {
  const now = Date.parse(nowIso);
  const since = now - cfg.startedWithinDays * 864e5;
  return listed
    .filter((j) => {
      const start = Date.parse(j.start_time);
      const left = (Date.parse(j.end_time) - now) / 864e5;
      return start >= since && start <= now && left >= cfg.minDaysLeft && j.joined >= cfg.minJoined;
    })
    .sort((a, b) => b.joined - a.joined)
    .slice(0, cfg.maxCandidates);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hit = (text, word) => new RegExp(`(^|[^a-z0-9])${escape(word)}([^a-z0-9]|$)`, 'i').test(text);
// words: 語単位で当てる / patterns: 正規表現（言い回しが揺れるもの用） / maxChars: 説明文がこの字数未満なら当たる
export const matchTags = (text, tags, description = text) =>
  tags
    .filter(
      (t) =>
        (t.words ?? []).some((w) => hit(text, w)) ||
        (t.patterns ?? []).some((p) => new RegExp(p, 'i').test(text)) ||
        (t.maxChars != null && (description?.length ?? 0) < t.maxChars),
    )
    .map((t) => t.name);

// like に当たったものを先に（当たった数の多い順）、次に参加者の多い順。dislike に当たったものは外す
export function applyTags(jams, tags, max) {
  const picked = [];
  const excluded = [];
  for (const j of jams) {
    const text = `${j.title}\n${j.description ?? ''}`;
    const bad = matchTags(text, tags.dislike ?? [], j.description);
    if (bad.length) { excluded.push({ ...j, excluded_by: bad }); continue; }
    picked.push({ ...j, tags: matchTags(text, tags.like ?? [], j.description) });
  }
  picked.sort((a, b) => b.tags.length - a.tags.length || b.joined - a.joined);
  return { picked: picked.slice(0, max), excluded };
}
