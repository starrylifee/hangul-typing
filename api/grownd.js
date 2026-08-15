/* =========================================================
   /api/grownd — 그라운드(growndcard.com) 포인트 전송 중계
   그라운드 API 키를 학생 화면에 노출하지 않으려고 서버를 거친다.
   키는 교사 브라우저에서 요청마다 담겨 오고, 서버에는 저장하지 않는다.
   ========================================================= */

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 40;                 // 한 반 전체 전송을 감안해 넉넉히
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) hits.clear();
  return list.length > RATE_MAX;
}

function sameSite(req) {
  const host = req.headers.host || '';
  const src = req.headers.origin || req.headers.referer || '';
  if (!src) return false;
  try {
    return new URL(src).host === host;
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 만 받습니다' });
    return;
  }
  if (!sameSite(req)) {
    res.status(403).json({ error: '이 주소에서 온 요청만 받습니다' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) {
    res.status(429).json({ error: '조금 뒤에 다시 시도해 주세요' });
    return;
  }

  const { apiKey, classId, studentCode, points, description } = req.body || {};
  if (!apiKey || !classId || !studentCode || !points) {
    res.status(400).json({ error: 'apiKey, classId, studentCode, points 가 필요합니다' });
    return;
  }

  try {
    const url = 'https://growndcard.com/api/v1/classes/' + encodeURIComponent(classId)
      + '/students/' + encodeURIComponent(studentCode) + '/points';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        type: 'reward',
        points: Number(points) | 0,
        description: String(description || '타자 연습 목표 달성').slice(0, 100),
        source: 'hangul-typing'
      })
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: '그라운드에 연결하지 못했습니다' });
  }
};
