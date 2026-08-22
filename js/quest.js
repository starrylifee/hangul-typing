/* =========================================================
   quest.js — 시즌 여정
   마을(판)은 시즌마다 같지만 "이번 시즌엔 뭘 해야 하지"가 달라지면 새롭다.
   마을은 시간을 부으면 차고, 여정은 실력이 있어야 깨진다.
   과제를 깨면 시즌 포인트가 붙어서 마을이 자란다 — 실력 → 마을로 이어지는 고리.

   과제 종류
     act    활동 한 번마다 센다 (연습·게임 기록을 그때그때 본다)
     day    그날 하루를 통째로 보고 하루에 한 번 센다
     streak 며칠 내리 했는지 — 날짜 기록에서 다시 계산한다
     best   가장 잘한 값이 목표를 넘으면 깬 것으로 친다
   day·streak·best 는 기록에서 다시 계산하므로 되돌아가지 않게 늘 큰 값을 남긴다.
   ========================================================= */
var QUEST = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var REWARD = 30;        // 과제 하나를 깨면 붙는 시즌 포인트
  var ALL_BONUS = 200;    // 열 개를 다 깨면

  /* ---------- 과제 창고 ---------- */
  var POOL = {
    acc95x5: {
      kind: 'act', goal: 5, icon: '🎯', name: '또박또박 다섯 번',
      desc: '정확도 95%를 넘겨 연습 5번',
      hit: function (k, e) { return k === 'practice' && (e.acc || 0) >= 95; }
    },
    acc100x3: {
      kind: 'act', goal: 3, icon: '💎', name: '오타 없이 세 번',
      desc: '오타를 하나도 내지 않고 연습 3번',
      hit: function (k, e) { return k === 'practice' && (e.err || 0) === 0 && (e.keys || 0) > 20; }
    },
    place10: {
      kind: 'act', goal: 10, icon: '⌨️', name: '자리 익히기',
      desc: '자리 연습 10번',
      hit: function (k, e) { return k === 'practice' && e.mode === 'place'; }
    },
    long1: {
      kind: 'act', goal: 1, icon: '📖', name: '긴 글 한 편',
      desc: '긴 글을 처음부터 끝까지 한 편',
      hit: function (k, e) { return k === 'practice' && e.mode === 'long'; }
    },
    long5: {
      kind: 'act', goal: 5, icon: '📚', name: '긴 글 다섯 편',
      desc: '긴 글을 다섯 편 끝내기',
      hit: function (k, e) { return k === 'practice' && e.mode === 'long'; }
    },
    lv5x3: {
      kind: 'act', goal: 3, icon: '🧗', name: '높은 단계 도전',
      desc: '5단계 이상에서 연습 3번',
      hit: function (k, e) { return k === 'practice' && (e.level || 0) >= 5; }
    },
    gamewin5: {
      kind: 'act', goal: 5, icon: '🏆', name: '다섯 번 이기기',
      desc: '게임에서 5번 이기기',
      hit: function (k, e) { return k === 'game' && e.win; }
    },
    cpm150: {
      kind: 'best', goal: 150, icon: '⚡', name: '150타 넘기',
      desc: '어느 단계에서든 150타를 넘기기',
      val: function (d) { return d.cpm || 0; }
    },
    cpm200: {
      kind: 'best', goal: 200, icon: '🚀', name: '200타 넘기',
      desc: '어느 단계에서든 200타를 넘기기',
      val: function (d) { return d.cpm || 0; }
    },
    combo30: {
      kind: 'best', goal: 30, icon: '🔥', name: '연속 서른',
      desc: '게임에서 30번 내리 성공',
      val: function (d) { return d.combo || 0; }
    },
    streak7: {
      kind: 'streak', goal: 7, icon: '📅', name: '일주일 개근',
      desc: '하루도 안 빠지고 7일'
    },
    streak14: {
      kind: 'streak', goal: 14, icon: '🗓️', name: '열나흘 개근',
      desc: '하루도 안 빠지고 14일'
    },
    allmode: {
      kind: 'day', goal: 3, icon: '🌈', name: '다섯 가지 다 하기',
      desc: '하루에 다섯 가지를 모두 한 날 3일',
      day: function (s) {
        var m = s.modes || {};
        return m.place && m.word && m.short && m.long && m.game;
      }
    },
    min20x5: {
      kind: 'day', goal: 5, icon: '⏳', name: '하루 20분씩 닷새',
      desc: '20분 넘게 연습한 날이 5일',
      day: function (s) { return (s.sec || 0) >= 20 * 60; }
    }
  };

  /* ---------- 시즌마다 다른 열 개 ----------
     같은 마을을 다시 짓더라도 해야 할 일이 달라지면 새 시즌이 된다.
     쉬운 것부터 늘어놓아 처음 온 아이가 막히지 않게 했다. */
  var PACKS = {
    '봄': ['long1', 'place10', 'acc95x5', 'streak7', 'cpm150', 'allmode', 'gamewin5', 'lv5x3', 'min20x5', 'acc100x3'],
    '여름': ['place10', 'acc100x3', 'streak7', 'gamewin5', 'combo30', 'long5', 'cpm150', 'allmode', 'lv5x3', 'streak14'],
    '가을': ['long1', 'acc95x5', 'streak7', 'lv5x3', 'gamewin5', 'cpm150', 'combo30', 'min20x5', 'acc100x3', 'cpm200'],
    '겨울': ['place10', 'long1', 'streak7', 'allmode', 'acc95x5', 'combo30', 'cpm150', 'long5', 'streak14', 'cpm200']
  };

  function sess() { return (window.APP && APP.rec && APP.rec.cloud) || null; }

  /** 이번 시즌 과제 열 개 — [{id, ...정의}] */
  function list() {
    if (!window.VILLAGE) return [];
    var name = VILLAGE.seasonOf().key.split('-')[1];
    var ids = PACKS[name] || PACKS['봄'];
    return ids.map(function (id) {
      var d = POOL[id];
      return d ? { id: id, kind: d.kind, goal: d.goal, icon: d.icon, name: d.name, desc: d.desc } : null;
    }).filter(Boolean);
  }

  /** 시즌 주머니 안의 여정 칸 */
  function state() {
    if (!window.VILLAGE) return null;
    var s = VILLAGE.season();
    if (!s) return null;
    if (!s.q) s.q = { prog: {}, done: [], allDone: false };
    if (!s.q.prog) s.q.prog = {};
    if (!s.q.done) s.q.done = [];
    return s.q;
  }

  /* ---------- 기록에서 다시 계산하는 것들 ----------
     날짜 기록은 이 컴퓨터에만 있어서, 자리를 옮기면 사라진다.
     그래서 계산값이 저장값보다 클 때만 올린다 (되돌아가지 않게). */

  /** 이번 시즌 안에서 연습·게임을 한 날들 (오름차순) */
  function seasonDays() {
    if (!window.APP || !APP.rec.days || !window.VILLAGE) return [];
    var s = VILLAGE.season();
    if (!s) return [];
    var out = [];
    for (var k in APP.rec.days) {
      var d = APP.rec.days[k];
      if (!d) continue;
      var n = (d.practice || []).length + (d.games || []).length;
      if (!n) continue;
      // 시즌이 시작하기 전 기록은 세지 않는다
      if (VILLAGE.seasonOf(new Date(k + 'T12:00:00')).key !== s.key) continue;
      out.push(k);
    }
    return out.sort();
  }

  /** 가장 길게 이어서 한 날수 */
  function bestStreak() {
    var ds = seasonDays();
    if (!ds.length) return 0;
    var best = 1, run = 1;
    for (var i = 1; i < ds.length; i++) {
      var a = new Date(ds[i - 1] + 'T12:00:00');
      var b = new Date(ds[i] + 'T12:00:00');
      var gap = Math.round((b - a) / 86400000);
      run = gap === 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  }

  /** 그날 하루 요약 — report.js 의 집계를 빌린다 */
  function daySum(key) {
    if (window.REPORT && REPORT.summarize) return REPORT.summarize(key);
    return null;
  }

  /** 모든 과제를 이 컴퓨터의 날짜 기록에서 다시 센다.
      활동이 있을 때 하나씩 더하지 않고 늘 통째로 다시 세는 이유는,
      이 기능이 시즌 중간에 배포돼도 그동안 한 것이 그대로 잡히게 하려는 것이다.
      두 번 세는 사고도 원천적으로 없다. */
  function recompute() {
    var q = state();
    if (!q) return;
    var days = seasonDays();
    list().forEach(function (t) {
      var def = POOL[t.id], got = 0;

      if (t.kind === 'streak') {
        got = bestStreak();

      } else if (t.kind === 'day') {
        days.forEach(function (k) {
          var s = daySum(k);
          if (s && def.day(s)) got++;
        });

      } else if (t.kind === 'best') {
        days.forEach(function (k) {
          var s = daySum(k);
          if (!s) return;
          (s.practice || []).concat(s.games || []).forEach(function (e) {
            var v = def.val(e);
            if (v > got) got = v;
          });
        });

      } else {   // act — 연습·게임 한 건씩 조건에 맞는지 본다
        days.forEach(function (k) {
          var s = daySum(k);
          if (!s) return;
          (s.practice || []).forEach(function (e) { if (def.hit('practice', e)) got++; });
          (s.games || []).forEach(function (e) { if (def.hit('game', e)) got++; });
        });
      }

      // 자리를 옮겨 기록이 사라져도 되돌아가지 않게 큰 값을 남긴다
      if (got > (q.prog[t.id] || 0)) q.prog[t.id] = got;
    });
  }

  /* ---------- 활동이 있을 때 (cloud.js 가 불러 준다) ---------- */
  function onActivity() {
    if (!state()) return;
    recompute();
    checkDone();
    APP.save();
  }

  /** 새로 깬 과제가 있으면 알리고 보상을 준다 */
  function checkDone() {
    var q = state();
    if (!q) return;
    var fresh = [];
    list().forEach(function (t) {
      if (q.done.indexOf(t.id) >= 0) return;
      if ((q.prog[t.id] || 0) >= t.goal) { q.done.push(t.id); fresh.push(t); }
    });
    if (!fresh.length) return;

    var c = sess();
    fresh.forEach(function (t, i) {
      setTimeout(function () {
        APP.toast('🧭 여정 완료 — ' + t.icon + ' ' + t.name + '!  +' + REWARD + 'P');
      }, 900 + i * 1600);
    });
    grant(REWARD * fresh.length);

    var all = list();
    if (!q.allDone && all.length && q.done.length >= all.length) {
      q.allDone = true;
      grant(ALL_BONUS);
      setTimeout(function () {
        APP.toast('🏅 이번 시즌 여정을 모두 마쳤어요! 정말 대단해요  +' + ALL_BONUS + 'P');
      }, 900 + fresh.length * 1600);
    }
    if (c) renderBadge();
  }

  /** 보상 포인트 — 시즌(마을)과 평생 누적에 함께 붙는다 */
  function grant(p) {
    var c = sess();
    if (!c || p <= 0) return;
    var before = window.VILLAGE ? VILLAGE.addPoints(p) : 0;
    c.points = (c.points || 0) + p;
    c.level = 1 + Math.floor(c.points / 150);
    if (window.VILLAGE) VILLAGE.onPoints(before, before + p, { by: '시즌 여정' });
    APP.save();
    if (window.CLOUD && CLOUD.renderBadge) CLOUD.renderBadge();
    if (window.CLOUD && CLOUD.sync) setTimeout(CLOUD.sync, 3000);
  }

  /* ---------- 화면 ---------- */
  function done() {
    var q = state();
    return q ? q.done.length : 0;
  }
  function renderBadge() {
    var el = $('vg-journey-n');
    if (el) el.textContent = done() + '/' + list().length;
  }

  function open() {
    if (!sess()) return;
    recompute();
    checkDone();
    APP.save();
    render();
    var m = $('vg-journey');
    if (m) m.hidden = false;
  }
  function close() {
    var m = $('vg-journey');
    if (m) m.hidden = true;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render() {
    var q = state();
    if (!q) return;
    var ts = list();
    var nDone = q.done.length;

    var head = $('vg-journey-head');
    if (head) {
      head.textContent = (window.VILLAGE ? VILLAGE.seasonOf().label : '이번 시즌')
        + ' 여정 · ' + nDone + ' / ' + ts.length
        + (q.allDone ? '  🏅 모두 마침!' : '');
    }
    var bar = $('vg-journey-bar');
    if (bar) bar.style.width = Math.round(nDone / ts.length * 100) + '%';

    var box = $('vg-journey-list');
    if (!box) return;
    box.innerHTML = ts.map(function (t) {
      var got = Math.min(q.prog[t.id] || 0, t.goal);
      var ok = q.done.indexOf(t.id) >= 0;
      var unit = t.kind === 'best' ? '' : (t.kind === 'streak' || t.kind === 'day' ? '일' : '번');
      return '<div class="qt' + (ok ? ' ok' : '') + '">'
        + '<span class="mk">' + (ok ? '✅' : '⬜') + '</span>'
        + '<span class="ic">' + t.icon + '</span>'
        + '<span class="bd"><b>' + esc(t.name) + '</b><em>' + esc(t.desc) + '</em></span>'
        + '<span class="pg"><i style="width:' + Math.round(got / t.goal * 100) + '%"></i></span>'
        + '<span class="ct">' + got + ' / ' + t.goal + unit + '</span>'
        + '<span class="rw">' + (ok ? '받음' : '+' + REWARD + 'P') + '</span>'
        + '</div>';
    }).join('');
  }

  function init() {
    var b = $('btn-vg-journey');
    if (b) b.onclick = open;
    var ok = $('vg-journey-ok');
    if (ok) ok.onclick = close;
    renderBadge();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    onActivity: onActivity, open: open, list: list, state: state,
    done: done, recompute: recompute, renderBadge: renderBadge,
    REWARD: REWARD
  };
})();
