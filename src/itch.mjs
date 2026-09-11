// itch.io アダプタ。取得（fetch）と読み取り（parse）を分け、parse はテストで固定HTMLに当てる
import * as cheerio from 'cheerio';

export const SITE = 'itch';
const BASE = 'https://itch.io';
const UA = 'jam-tracker/0.1 (personal use, 1 run per day)';

export async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

export const fetchList = () => fetchHtml(`${BASE}/jams`);
export const fetchDetail = (url) => fetchHtml(url);

// "2026-09-11 11:00:00"（itch は UTC で埋め込む）→ ISO
const toIso = (s) => (s ? s.replace(' ', 'T') + 'Z' : null);

// 一覧ページの FilteredJamCalendar({"jams":[...]}) を読む
export function parseList(html) {
  const m = html.match(/FilteredJamCalendar\((\{"jams":.*?\})\)/s);
  if (!m) throw new Error('itch: ジャム一覧のJSONが見つからない（ページ構造が変わった可能性）');
  const { jams } = JSON.parse(m[1]);
  return jams.map((j) => {
    const slug = j.url.replace(/^\/jam\//, '');
    return {
      id: `${SITE}:${slug}`,
      site: SITE,
      title: j.title,
      url: BASE + j.url,
      start_time: toIso(j.start_date),
      end_time: toIso(j.end_date),
      voting_end_time: toIso(j.voting_end_date),
      joined: j.joined ?? 0,
      featured: Boolean(j.featured),
    };
  });
}

const TBA = /\b(tba|tbd|tbc|revealed?|announced?|announcement|will be|to be|secret|hidden|surprise|up to you)\b|\.\.\.|\?/i;
const THEME_LINE = /^(?:the\s+)?(?:(?:jam|main|secondary|official)\s+)?theme\s*(?:is|:|-|–|—)\s*(.+)$/i;

// 詳細ページ: 説明文と、書いてあればテーマを拾う
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const body = $('.jam_content.user_formatted');
  body.find('br').replaceWith('\n');
  body.find('p,li,h1,h2,h3,h4,div').each((_, el) => { $(el).append('\n'); });
  const text = body.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const entries = Number($('.stat_box a[href$="/entries"] .stat_value').first().text().replace(/,/g, '')) || null;
  return { description: text ? text.slice(0, 2000) : null, theme: findTheme(text), entries };
}

// テーマは説明文からの推定。「Theme: 〇〇」のような短い行だけを見る。未発表・曖昧なら null
export function findTheme(text) {
  if (!text) return null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length > 100) continue;
    const m = line.match(THEME_LINE);
    if (!m) continue;
    if (TBA.test(line)) return null;
    const t = m[1].replace(/^[\s:"“'‘]+|[\s"”'’.!]+$/g, '').trim();
    return t.length >= 2 && t.length <= 60 ? t : null;
  }
  return null;
}
