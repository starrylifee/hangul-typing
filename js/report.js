/* =========================================================
   report.js — 오늘 학습 리포트 · PDF 내려받기 · 어제 PDF 이어붙이기
   ========================================================= */
var REPORT = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* PDF 안에 넣는 데이터 블록 표시 */
  var MARK_A = 'TYPING-DATA-v1';
  var MARK_B = 'END-TYPING-DATA';

  /* 오늘 목표.
     컴퓨터를 처음 만지는 아이 기준으로 넉넉하게 잡았다.
     떨어뜨리기 위한 기준이 아니라, 오늘 무엇을 했는지 보여 주기 위한 눈금이다. */
  var DEFAULT_GOALS = {
    minutes: 10,
    acc: 85,
    cpm: { 1: 40, 2: 45, 3: 50, 4: 55, 5: 60, 6: 65, 7: 70 }
  };

  function goals() {
    var g = APP.rec.goals;
    if (!g) return JSON.parse(JSON.stringify(DEFAULT_GOALS));
    var d = JSON.parse(JSON.stringify(DEFAULT_GOALS));
    if (g.minutes) d.minutes = g.minutes;
    if (g.acc) d.acc = g.acc;
    if (g.cpm) for (var k in g.cpm) d.cpm[k] = g.cpm[k];
    return d;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(key) {
    var p = key.split('-');
    return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일';
  }
  function fmtMin(sec) {
    if (sec < 60) return sec + '초';
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + '분' + (s ? ' ' + s + '초' : '');
  }

  /* =========================================================
     하루치 집계
     ========================================================= */
  function summarize(dayKey) {
    // 아직 아무것도 안 한 날도 빈 집계를 돌려준다.
    // 아침에 어제 리포트만 불러오고 바로 PDF를 받는 경우가 있다.
    var d = APP.rec.days[dayKey] || { practice: [], games: [], miss: {} };
    var pr = d.practice || [], gm = d.games || [];
    var sec = 0, keys = 0, err = 0, bestCpm = 0;

    pr.forEach(function (p) {
      sec += p.sec || 0; keys += p.keys || 0; err += p.err || 0;
      if (p.cpm > bestCpm) bestCpm = p.cpm;
    });
    gm.forEach(function (g) {
      sec += g.sec || 0; keys += g.keys || 0; err += g.err || 0;
      if (g.cpm > bestCpm) bestCpm = g.cpm;
    });

    var acc = (keys + err) > 0 ? Math.round(keys / (keys + err) * 100) : 0;

    // 단계별 최고 기록
    var byLevel = {};
    pr.forEach(function (p) {
      if (!p.level) return;
      var b = byLevel[p.level] || (byLevel[p.level] = { n: 0, cpm: 0, acc: 0, modes: {} });
      b.n++;
      if (p.cpm > b.cpm) b.cpm = p.cpm;
      if (p.acc > b.acc) b.acc = p.acc;
      b.modes[p.mode] = true;
    });

    var modes = {};
    pr.forEach(function (p) { modes[p.mode] = (modes[p.mode] || 0) + 1; });
    if (gm.length) modes.game = gm.length;

    return {
      date: dayKey, sec: sec, keys: keys, err: err, acc: acc,
      cpm: bestCpm, byLevel: byLevel, modes: modes,
      miss: d.miss || {}, practice: pr, games: gm
    };
  }

  /** 오늘 통과했는가 */
  function judgeDay(sum) {
    var g = goals();
    var checks = [];
    var minOk = sum.sec >= g.minutes * 60;
    checks.push({
      label: '연습 시간 ' + g.minutes + '분 이상',
      got: fmtMin(sum.sec), ok: minOk
    });
    var accOk = sum.acc >= g.acc;
    checks.push({
      label: '정확도 ' + g.acc + '% 이상',
      got: sum.acc + '%', ok: accOk
    });

    // 오늘 연습한 단계 중 목표 타수를 넘긴 게 있는가
    var levelPass = [], levelFail = [];
    for (var lv in sum.byLevel) {
      var target = g.cpm[lv] || 100;
      if (sum.byLevel[lv].cpm >= target) levelPass.push(lv);
      else levelFail.push(lv);
    }
    var lvOk = levelPass.length > 0;
    checks.push({
      label: '단계 목표 타수 달성',
      got: levelPass.length ? levelPass.join('·') + '단계 통과' : '아직 없음',
      ok: lvOk
    });

    var done = (minOk ? 1 : 0) + (accOk ? 1 : 0) + (lvOk ? 1 : 0);
    var passed = done === 3;
    // 떨어뜨리는 판정이 아니라 오늘 어디까지 왔는지 보여 주는 말이다
    var grade = done === 3 ? '아주 잘했어요'
      : done === 2 ? '거의 다 왔어요'
        : done === 1 ? '잘하고 있어요'
          : '오늘도 시작';
    return {
      passed: passed, grade: grade, done: done, checks: checks,
      levelPass: levelPass, levelFail: levelFail
    };
  }

  /** 자주 틀린 자리 */
  function missTop(miss, n) {
    var arr = [];
    for (var k in miss) {
      var f = HG.fingerOf(k);
      arr.push({
        key: k, jamo: HG.KEYMAP[k] || k, count: miss[k],
        finger: HG.FINGER_NAME[f] || '', fi: f
      });
    }
    arr.sort(function (a, b) { return b.count - a.count; });
    return arr.slice(0, n || 5);
  }

  /* =========================================================
     누적 이력 — 오늘 기록 + 어제 PDF에서 불러온 것
     ========================================================= */
  function history() {
    var out = {}, k;
    // PDF 로 불러온 지난 기록
    var imp = APP.rec.imported || {};
    for (k in imp) out[k] = imp[k];
    // 이 컴퓨터에 남은 기록이 우선
    for (k in APP.rec.days) {
      var s = summarize(k);
      // 아무것도 안 한 날은 이력에 넣지 않는다
      if (s && (s.keys > 0 || s.sec > 0)) {
        out[k] = { sec: s.sec, keys: s.keys, err: s.err, acc: s.acc, cpm: s.cpm };
      }
    }
    var list = [];
    for (k in out) list.push({ date: k, d: out[k] });
    list.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return list;
  }

  /* =========================================================
     화면 그리기
     ========================================================= */
  var MODE_LABEL = {
    place: '자리 연습', word: '낱말 연습', short: '짧은 글',
    long: '긴 글', game: '타자 게임'
  };
  var ALL_MODES = ['place', 'word', 'short', 'long', 'game'];

  var aiComment = null;      // Solar 가 써 준 문장

  function render() {
    var today = APP.todayKey();
    APP.dayLog(today);                      // 없으면 만들어 둔다
    var sum = summarize(today);
    var jd = judgeDay(sum);
    var g = goals();
    var hist = history();
    var name = APP.rec.name || '';

    var did = ALL_MODES.filter(function (m) { return sum.modes[m]; });
    var notYet = ALL_MODES.filter(function (m) { return !sum.modes[m]; });
    var top = missTop(sum.miss, 5);

    var h = '';

    /* --- 머리말 --- */
    h += '<div class="rep-head">' +
      '<div>' +
      '<div class="rep-school">신답초등학교 AI 디지털 선도학교 여름캠프</div>' +
      '<h2>한글 타자 연습 · 오늘 학습 리포트</h2>' +
      '<div class="rep-date">' + fmtDate(today) + '</div>' +
      '</div>' +
      '<div class="rep-name">' +
      '<label>이름</label>' +
      '<input type="text" id="rep-name" value="' + esc(name) + '" placeholder="이름을 적어 주세요" maxlength="20">' +
      '</div>' +
      '</div>';

    /* --- 오늘 목표 --- */
    h += '<div class="verdict ' + (jd.done === 3 ? 'ok' : jd.done >= 1 ? 'mid' : 'no') + '">' +
      '<div class="v-badge">' + jd.grade + '</div>' +
      '<div class="v-checks"><div class="v-cap">오늘 목표 ' + jd.done + ' / 3</div>';
    jd.checks.forEach(function (c) {
      h += '<div class="v-chk ' + (c.ok ? 'y' : 'n') + '">' +
        '<span class="mk">' + (c.ok ? '✓' : '·') + '</span>' +
        '<span class="lb">' + esc(c.label) + '</span>' +
        '<span class="gt">' + esc(c.got) + '</span></div>';
    });
    h += '</div></div>';

    /* --- 오늘 숫자 --- */
    h += '<div class="rep-cards">' +
      card('연습 시간', fmtMin(sum.sec), '목표 ' + g.minutes + '분', sum.sec >= g.minutes * 60) +
      card('친 글자 수', sum.keys.toLocaleString() + '타', '오타 ' + sum.err + '번', true) +
      card('가장 빠른 타수', sum.cpm + '타', '분당', true) +
      card('정확도', sum.acc + '%', '목표 ' + g.acc + '%', sum.acc >= g.acc) +
      '</div>';

    /* --- 한 것 / 안 한 것 --- */
    h += '<div class="rep-two">';
    h += '<section class="rep-box"><h3>오늘 한 것</h3>';
    if (did.length) {
      h += '<ul class="did">';
      did.forEach(function (m) {
        h += '<li><b>' + MODE_LABEL[m] + '</b><span>' + sum.modes[m] + '번</span></li>';
      });
      h += '</ul>';
    } else {
      h += '<p class="empty">아직 연습을 시작하지 않았습니다.</p>';
    }
    h += '</section>';

    h += '<section class="rep-box"><h3>아직 안 한 것</h3>';
    if (notYet.length) {
      h += '<ul class="notyet">';
      notYet.forEach(function (m) { h += '<li>' + MODE_LABEL[m] + '</li>'; });
      h += '</ul>';
    } else {
      h += '<p class="empty good">다섯 가지를 모두 해냈습니다.</p>';
    }
    h += '</section>';
    h += '</div>';

    /* --- 단계별 --- */
    h += '<section class="rep-box"><h3>단계별 기록</h3>';
    var lvRows = '';
    DATA.LEVELS.forEach(function (lv) {
      var b = sum.byLevel[lv.no];
      var target = g.cpm[lv.no];
      if (!b) {
        lvRows += '<tr class="off"><td>' + lv.no + '단계</td><td>' + lv.name + '</td>' +
          '<td colspan="3" class="c dim">오늘 안 함</td><td class="c">' + target + '타</td></tr>';
        return;
      }
      var ok = b.cpm >= target;
      lvRows += '<tr class="' + (ok ? 'pass' : '') + '">' +
        '<td>' + lv.no + '단계</td><td>' + lv.name + '</td>' +
        '<td class="c">' + b.n + '번</td>' +
        '<td class="c"><b>' + b.cpm + '타</b></td>' +
        '<td class="c">' + b.acc + '%</td>' +
        '<td class="c">' + (ok ? '<span class="ok">통과</span>' : target + '타') + '</td></tr>';
    });
    h += '<table class="rep-table"><thead><tr>' +
      '<th>단계</th><th>이름</th><th class="c">횟수</th><th class="c">최고 타수</th>' +
      '<th class="c">정확도</th><th class="c">목표</th></tr></thead>' +
      '<tbody>' + lvRows + '</tbody></table></section>';

    /* --- 자주 틀린 자리 --- */
    h += '<div class="rep-two">';
    h += '<section class="rep-box"><h3>자주 틀린 자리</h3>';
    if (top.length) {
      h += '<div class="miss-list">';
      top.forEach(function (t) {
        h += '<div class="miss">' +
          '<span class="mj" style="--fc:' + (KB.FCOLOR[t.fi] || 'var(--dim)') + '">' + esc(t.jamo) + '</span>' +
          '<span class="mf">' + esc(t.finger) + '</span>' +
          '<span class="mc">' + t.count + '번</span>' +
          '</div>';
      });
      h += '</div><p class="hintnote">이 자리들을 자리 연습에서 한 번 더 해 보면 좋겠습니다.</p>';
    } else {
      h += '<p class="empty good">눈에 띄게 틀린 자리가 없습니다.</p>';
    }
    h += '</section>';

    /* --- 게임 --- */
    h += '<section class="rep-box"><h3>오늘 한 게임</h3>';
    if (sum.games.length) {
      h += '<table class="rep-table"><thead><tr><th>게임</th><th class="c">단계</th>' +
        '<th class="c">난이도</th><th class="c">점수</th><th class="c">타수</th></tr></thead><tbody>';
      sum.games.slice(-6).forEach(function (gm) {
        h += '<tr><td>' + esc(gm.name) + '</td><td class="c">' + gm.level + '</td>' +
          '<td class="c">' + esc(gm.diffName) + '</td>' +
          '<td class="c"><b>' + gm.score + '</b></td><td class="c">' + gm.cpm + '타</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="empty">오늘은 게임을 하지 않았습니다.</p>';
    }
    h += '</section>';
    h += '</div>';

    /* --- 지난 날과 견주기 (캠프가 길어질 수 있어 최근 것만 그린다) --- */
    if (hist.length > 1) {
      var first = hist[0], last = hist[hist.length - 1];
      var totalKeys = 0, totalSec = 0;
      hist.forEach(function (x) { totalKeys += x.d.keys || 0; totalSec += x.d.sec || 0; });
      var grew = last.d.cpm - first.d.cpm;

      h += '<section class="rep-box"><h3>지금까지 쌓인 기록</h3>';
      h += '<div class="rep-cards sm">' +
        card('연습한 날', hist.length + '일', first.date.slice(5).replace('-', '/') + ' 부터', true) +
        card('모두 친 글자', totalKeys.toLocaleString() + '타', '총 ' + fmtMin(totalSec), true) +
        card('첫날 타수', first.d.cpm + '타', fmtDate(first.date).slice(6), true) +
        card('늘어난 타수', (grew >= 0 ? '+' : '') + grew + '타', '첫날과 견주어', grew >= 0) +
        '</div>';

      var show = hist.slice(-21);
      var maxCpm = 1;
      show.forEach(function (x) { if (x.d.cpm > maxCpm) maxCpm = x.d.cpm; });
      h += '<div class="bars' + (show.length > 12 ? ' many' : '') + '">';
      show.forEach(function (x) {
        var pct = Math.round(x.d.cpm / maxCpm * 100);
        h += '<div class="bar' + (x.date === today ? ' now' : '') + '">' +
          '<div class="bv">' + x.d.cpm + '</div>' +
          '<div class="bcol"><i style="height:' + Math.max(pct, 4) + '%"></i></div>' +
          '<div class="bd">' + x.date.slice(5).replace('-', '/') + '</div>' +
          '</div>';
      });
      h += '</div><p class="hintnote">막대는 그날 가장 빠른 타수입니다.' +
        (hist.length > 21 ? ' 최근 21일만 그렸습니다.' : '') + '</p></section>';
    }

    /* --- 내 마을 (반에 로그인한 학생만) --- */
    h += villageSection();

    /* --- AI 한마디 --- */
    h += '<section class="rep-box ai"><h3>선생님 한마디</h3>' +
      '<div id="ai-comment" class="ai-body">' +
      (aiComment ? esc(aiComment) : '<span class="dim">평가를 불러오는 중…</span>') +
      '</div></section>';

    h += '<div class="rep-foot">이 리포트는 이 컴퓨터에만 저장됩니다. ' +
      'PDF로 내려받아 두면 다음 날 불러와서 기록을 이어 붙일 수 있습니다.</div>';

    $('report-body').innerHTML = h;

    $('rep-name').addEventListener('change', function () {
      APP.rec.name = this.value.trim();
      APP.save();
    });

    if (!aiComment) fetchComment(sum, jd, top);
    return { sum: sum, judge: jd, top: top, hist: hist };
  }

  /* =========================================================
     내 마을 — 이번 시즌에 무엇을 얼마나 모았는지
     반에 로그인한 학생만 보인다 (마을이 반 기능이라서).
     ========================================================= */
  function villageSection() {
    var c = APP.rec.cloud;
    if (!c || !window.VILLAGE) return '';
    var s = c.season || { sp: 0, vg: {}, label: '' };
    var sum = VILLAGE.summary(s.sp || 0);

    var h = '<section class="rep-box"><h3>내 마을 · ' + esc(s.label || '이번 시즌') + '</h3>';
    h += '<div class="rep-cards sm">' +
      card('시즌 포인트', (s.sp || 0) + 'P', '평생 ' + (c.points || 0) + 'P · Lv.' + (c.level || 1), true) +
      card('모은 것', sum.got + ' / ' + sum.total + '개', sum.chapter + '장 ' + sum.chapterName, true) +
      card('시즌 끝까지', VILLAGE.daysLeft() + '일', '남으면 마을이 새로 시작해요', true) +
      card('다음 목표', sum.done ? '모두 완성' : sum.nextName,
        sum.done ? '🏆 대단해요!' : (sum.nextIn + 'P 남음'), true) +
      '</div>';

    /* 장별 진행 */
    h += '<div class="vg-rep-chs">';
    VILLAGE.CHAPTERS.forEach(function (ch) {
      var got = ch.items.filter(function (m) { return (s.sp || 0) >= m.p; }).length;
      var open = (s.sp || 0) >= ch.from;
      h += '<div class="vg-rep-ch' + (got === ch.items.length ? ' done' : open ? '' : ' lock') + '">' +
        '<span class="i">' + (open ? ch.icon : '🔒') + '</span>' +
        '<span class="n">' + ch.no + '장 ' + esc(ch.name) + '</span>' +
        '<span class="bar"><i style="width:' + Math.round(got / ch.items.length * 100) + '%"></i></span>' +
        '<span class="c">' + got + '/' + ch.items.length + '</span>' +
        (got === ch.items.length ? '<span class="m">🏅</span>' : '') +
        '</div>';
    });
    h += '</div>';

    /* 최근에 받은 것 — "이 아이콘이 왜 생겼지" 에 대한 답 */
    var got = [];
    VILLAGE.CHAPTERS.forEach(function (ch) {
      ch.items.forEach(function (m) {
        var r = s.vg && s.vg[m.key];
        if (r && r.at) got.push({ name: m.name, ch: ch.no, r: r });
      });
    });
    got.sort(function (a, b) { return b.r.at - a.r.at; });
    if (got.length) {
      h += '<table class="rep-table"><thead><tr><th>최근에 생긴 것</th><th class="c">장</th>' +
        '<th class="c">받은 날</th><th class="c">그때 레벨</th><th>무엇을 하다가</th></tr></thead><tbody>';
      got.slice(0, 6).forEach(function (x) {
        var d = new Date(x.r.at);
        h += '<tr><td><b>' + esc(x.name) + '</b></td>' +
          '<td class="c">' + x.ch + '장</td>' +
          '<td class="c">' + (d.getMonth() + 1) + '/' + d.getDate() + '</td>' +
          '<td class="c">Lv.' + (x.r.lv || 1) + '</td>' +
          '<td>' + esc(x.r.by || '—') + '</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="empty">아직 마을에 아무것도 없어요. 연습하면 포인트가 쌓여요!</p>';
    }

    /* 지난 시즌 */
    var pk = c.past ? Object.keys(c.past).sort().reverse() : [];
    if (pk.length) {
      h += '<p class="hintnote">지난 시즌 — ' + pk.map(function (k) {
        var o = c.past[k], ps = VILLAGE.summary(o.sp || 0);
        return esc(o.label || k) + ' ' + (o.sp || 0) + 'P (' + ps.got + '/' + ps.total + '개)';
      }).join('   ·   ') + '</p>';
    }
    h += '</section>';
    return h;
  }

  function card(k, v, sub, ok) {
    return '<div class="rcard2' + (ok ? '' : ' warn') + '">' +
      '<div class="k">' + k + '</div><div class="v">' + v + '</div>' +
      '<div class="s">' + sub + '</div></div>';
  }

  /* =========================================================
     평가 문장 — Solar 서버리스, 안 되면 규칙으로
     ========================================================= */
  function ruleComment(sum, jd, top) {
    if (sum.keys === 0) {
      return '오늘은 아직 연습을 시작하지 않았습니다. 자리 연습부터 한 번 해 볼까요.';
    }
    var s = [];
    s.push('오늘 ' + fmtMin(sum.sec) + ' 동안 ' + sum.keys.toLocaleString() + '글자를 쳤습니다.');
    if (sum.acc >= 98) s.push('거의 틀리지 않고 정확하게 쳤습니다.');
    else if (sum.acc >= 95) s.push('정확도가 좋습니다. 이대로 속도를 조금씩 올려 보세요.');
    else if (sum.acc >= 88) s.push('속도보다 정확도를 먼저 챙기면 더 빨리 늘 수 있습니다.');
    else s.push('조금 천천히 쳐서 틀리지 않는 연습을 먼저 해 보면 좋겠습니다.');

    if (top.length) {
      s.push(top[0].jamo + ' 자리를 ' + top[0].count + '번 틀렸습니다. ' +
        top[0].finger + '를 제자리에 두고 눌러 보세요.');
    }
    if (jd.passed) s.push('오늘 목표를 모두 채웠습니다. 잘했습니다.');
    else if (sum.sec < goals().minutes * 60) s.push('시간이 조금 모자랍니다. 한 번 더 해 봅시다.');
    return s.join(' ');
  }

  function fetchComment(sum, jd, top) {
    var fallback = ruleComment(sum, jd, top);

    // 학생 이름은 보내지 않는다
    var payload = {
      sec: sum.sec, keys: sum.keys, err: sum.err, acc: sum.acc, cpm: sum.cpm,
      levels: Object.keys(sum.byLevel).map(function (lv) {
        return { level: Number(lv), cpm: sum.byLevel[lv].cpm, acc: sum.byLevel[lv].acc };
      }),
      modes: sum.modes,
      missTop: top.map(function (t) { return { jamo: t.jamo, finger: t.finger, count: t.count }; }),
      grade: jd.grade,
      goals: goals()
    };

    var done = function (txt) {
      aiComment = txt;
      var el = $('ai-comment');
      if (el) el.textContent = txt;
    };

    if (sum.keys === 0 || location.protocol === 'file:') { done(fallback); return; }

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 12000);

    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('bad');
      return r.json();
    }).then(function (j) {
      done(j && j.comment ? j.comment : fallback);
    }).catch(function () {
      clearTimeout(timer);
      done(fallback);
    });
  }

  return {
    render: render,
    summarize: summarize,
    judgeDay: judgeDay,
    missTop: missTop,
    history: history,
    goals: goals,
    DEFAULT_GOALS: DEFAULT_GOALS,
    MARK_A: MARK_A, MARK_B: MARK_B,
    fmtDate: fmtDate, fmtMin: fmtMin,
    resetComment: function () { aiComment = null; },
    getComment: function () { return aiComment; }
  };
})();
