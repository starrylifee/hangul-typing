/* =========================================================
   /api/review — 오늘 학습 기록을 보고 평가 한마디를 써 준다 (Solar Pro 3)
   학생 이름은 애초에 받지 않는다. 숫자만 온다.
   환경변수: UPSTAGE_API_KEY
   ========================================================= */

const API_URL = 'https://api.upstage.ai/v1/chat/completions';

/* 교사 무료 플랜이 덮어 주는 모델만 쓴다.
   무료 대상은 Solar Pro 2/3 와 Document Parse 뿐이고, solar-mini 는 과금될 수 있다.
   그래서 모델 이름을 여기 고정해 두고 밖에서 바꿀 수 없게 한다. */
const MODEL = 'solar-pro3';

/* 공개 주소라 아무나 부를 수 있다. 무료 한도를 지키려고 최소한의 문을 달아 둔다.
   - 우리 사이트에서 온 요청만 받는다
   - 같은 사람이 짧은 시간에 여러 번 부르지 못하게 한다 */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 6;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) hits.clear();          // 메모리가 새지 않게
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

const SYSTEM = [
  '너는 초등학교 담임 교사다. 학생의 오늘 타자 연습 기록을 보고 짧은 총평을 쓴다.',
  '',
  '규칙:',
  '- 한국어로 3~4문장. 200자 안팎.',
  '- 반드시 존댓말로 쓴다. 모든 문장을 "~습니다" 또는 "~합니다" 로 끝낸다. 반말을 쓰지 않는다.',
  '- 문장마다 마침표를 찍는다. 마침표 없이 이어 붙이지 않는다.',
  '- 초등학생이 읽을 글이다. 쉬운 말로 쓴다.',
  '- 숫자는 주어진 값만 쓴다. 없는 사실을 지어내지 않는다.',
  '- 잘한 점을 먼저 말하고, 다음에 무엇을 하면 좋을지 한 가지만 짚는다.',
  '- 자주 틀린 자리가 있으면 그 자리와 손가락을 알려 준다.',
  '- 마크다운 기호(**, ##, -)를 쓰지 않는다. 줄바꿈 없이 이어 쓴다.',
  '- 이모지를 쓰지 않는다.',
  '- "~가 아니다. ~이다." 같은 도치 표현과 "흔들린다" 같은 상투적 표현을 쓰지 않는다.',
  '- 학생을 부를 때 이름 대신 그냥 문장을 쓴다. 이름은 주어지지 않는다.',
  '',
  '보기: 오늘 22분 동안 꾸준히 연습했습니다. 정확도가 97%로 목표를 넘었습니다. ' +
  'ㅋ 자리를 아홉 번 틀렸으니 왼손 새끼손가락을 제자리에 두고 눌러 보면 좋겠습니다. ' +
  '내일은 짧은 글도 한 번 해 봅시다.'
].join('\n');

function fmtMin(sec) {
  if (!sec) return '0분';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? m + '분' + (s ? ' ' + s + '초' : '') : s + '초';
}

const MODE_LABEL = {
  place: '자리 연습', word: '낱말 연습', short: '짧은 글',
  long: '긴 글', game: '타자 게임'
};

function buildPrompt(d) {
  const lines = [];
  lines.push('오늘 연습 시간: ' + fmtMin(d.sec) + ' (목표 ' + (d.goals && d.goals.minutes) + '분)');
  lines.push('친 글자 수: ' + d.keys + '타, 오타 ' + d.err + '번, 정확도 ' + d.acc + '% (목표 ' + (d.goals && d.goals.acc) + '%)');
  lines.push('가장 빠른 타수: ' + d.cpm + '타');

  const modes = Object.keys(d.modes || {})
    .map(function (m) { return (MODE_LABEL[m] || m) + ' ' + d.modes[m] + '번'; });
  lines.push('오늘 한 것: ' + (modes.length ? modes.join(', ') : '없음'));

  const notDone = Object.keys(MODE_LABEL)
    .filter(function (m) { return !(d.modes || {})[m]; })
    .map(function (m) { return MODE_LABEL[m]; });
  lines.push('아직 안 한 것: ' + (notDone.length ? notDone.join(', ') : '없음'));

  if (d.levels && d.levels.length) {
    lines.push('단계별 최고 기록: ' + d.levels.map(function (l) {
      const target = d.goals && d.goals.cpm ? d.goals.cpm[l.level] : null;
      return l.level + '단계 ' + l.cpm + '타 정확도 ' + l.acc + '%' +
        (target ? ' (목표 ' + target + '타)' : '');
    }).join(', '));
  }
  if (d.missTop && d.missTop.length) {
    lines.push('자주 틀린 자리: ' + d.missTop.map(function (t) {
      return t.jamo + '(' + t.finger + ') ' + t.count + '번';
    }).join(', '));
  }
  lines.push('오늘 판정: ' + d.grade);
  lines.push('');
  lines.push('위 기록을 보고 총평을 써라.');
  return lines.join('\n');
}

/** 들어온 값이 우리가 기대하는 숫자 묶음인지 가볍게 확인 */
function sane(d) {
  if (!d || typeof d !== 'object') return false;
  const nums = ['sec', 'keys', 'err', 'acc', 'cpm'];
  for (const k of nums) {
    if (typeof d[k] !== 'number' || !isFinite(d[k]) || d[k] < 0 || d[k] > 10000000) return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 만 받습니다' });
    return;
  }

  // 무료 한도를 지키기 위한 최소한의 문 — 막혀도 앱은 규칙 문장으로 넘어간다
  if (!sameSite(req)) {
    res.status(403).json({ error: '이 주소에서 온 요청만 받습니다' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) {
    res.status(429).json({ error: '조금 뒤에 다시 시도해 주세요' });
    return;
  }

  // 환경변수를 넣을 때 BOM·공백·따옴표가 섞여 들어오는 일이 있다.
  // 그대로 헤더에 넣으면 요청 자체가 깨지므로 걷어낸다.
  const key = String(process.env.UPSTAGE_API_KEY || '')
    .replace(/^﻿/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!key) {
    // 키가 없으면 앱이 규칙 기반 문장으로 넘어간다
    res.status(503).json({ error: 'UPSTAGE_API_KEY 가 없습니다' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!sane(body)) {
    res.status(400).json({ error: '기록 형식이 맞지 않습니다' });
    return;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 10000);

    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(body) }
        ],
        temperature: 0.6,
        max_tokens: 400,
        stream: false
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (!r.ok) {
      const t = await r.text();
      console.error('upstage', r.status, t.slice(0, 300));
      res.status(502).json({ error: '평가를 받아오지 못했습니다' });
      return;
    }

    const j = await r.json();
    let comment = j && j.choices && j.choices[0] && j.choices[0].message
      ? String(j.choices[0].message.content || '').trim() : '';

    // 혹시 남은 마크다운 기호와 줄바꿈을 걷어낸다
    comment = comment
      .replace(/[*#`>]/g, '')
      .replace(/\s*\n+\s*/g, ' ')
      .trim();

    if (!comment) {
      res.status(502).json({ error: '평가 내용이 비었습니다' });
      return;
    }
    if (comment.length > 600) comment = comment.slice(0, 600);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ comment: comment, model: MODEL });
  } catch (e) {
    console.error(e);
    res.status(504).json({ error: '평가 서버가 응답하지 않았습니다' });
  }
};
