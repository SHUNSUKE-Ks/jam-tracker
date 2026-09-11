// 一覧から拾うジャムを選ぶ。条件は config.json
// startedWithinDays: 過去N日以内に始まった / onlyOpen: まだ投稿を受け付けている / minJoined: 参加者数の下限 / max: 件数。参加者の多い順
export function pick(listed, cfg, nowIso) {
  const now = Date.parse(nowIso);
  const since = now - cfg.startedWithinDays * 864e5;
  return listed
    .filter((j) => {
      const start = Date.parse(j.start_time);
      const end = Date.parse(j.end_time);
      return start >= since && start <= now && (!cfg.onlyOpen || end > now) && j.joined >= cfg.minJoined;
    })
    .sort((a, b) => b.joined - a.joined)
    .slice(0, cfg.max);
}
