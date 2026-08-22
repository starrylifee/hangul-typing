/* =========================================================
   rank.js — 우리 반 (시즌 순위)
   시즌마다 새 경쟁이 생기게 하는 장치. 다만 초등학교 교실이라
   "너는 12명 중 12등" 을 보여 주지 않는다.
     · 반이 다 같이 모은 합계를 앞에 세운다 (협동)
     · 이름이 나오는 건 앞자리 다섯 명까지 (명예)
     · 그 아래 아이에게는 등수 대신 평균과 견준 말만 준다
   별명만 쓰므로 실명은 어디에도 나오지 않는다.
   ========================================================= */
var RANK = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var TOP = 5;                 // 이름을 보여 주는 앞자리
  var CACHE_MS = 5 * 60000;    // 5분에 한 번만 서버를 본다
  var cache = null, cacheAt = 0, loading = false;

  function sess() { return (window.APP && APP.rec && APP.rec.cloud) || null; }

  /** 그 학생의 이번 시즌 포인트 — 아직 새 버전으로 안 들어온 학생은 누적으로 갈음 */
  function spOf(d, key) {
    if (d.season && d.season.key === key) return d.season.sp || 0;
    if (d.season) return 0;             // 지난 시즌 기록만 있으면 이번 시즌은 0
    return d.points || 0;               // 시즌 칸이 아예 없으면 곧 물려받을 값
  }

  /** 반 학생을 읽어 이번 시즌 순위를 만든다 */
  function load() {
    var c = sess();
    if (!c || !window.CLOUD || !CLOUD.db) return Promise.resolve(null);
    if (cache && Date.now() - cacheAt < CACHE_MS) return Promise.resolve(cache);
    if (loading) return loading;

    var key = window.VILLAGE ? VILLAGE.seasonOf().key : '';
    loading = CLOUD.db().then(function (db) {
      return db.collection('classes').doc(c.code).collection('students').get();
    }).then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        rows.push({ nick: doc.id, sp: spOf(d, key), lv: d.level || 1 });
      });
      rows.sort(function (a, b) { return b.sp - a.sp || (a.nick < b.nick ? -1 : 1); });

      var total = 0;
      rows.forEach(function (r) { total += r.sp; });
      var me = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].nick === c.nick) { me = i; break; }

      cache = {
        rows: rows, total: total,
        avg: rows.length ? Math.round(total / rows.length) : 0,
        myRank: me >= 0 ? me + 1 : 0,
        mySp: me >= 0 ? rows[me].sp : (c.season ? c.season.sp || 0 : 0),
        n: rows.length
      };
      cacheAt = Date.now();
      loading = false;
      return cache;
    }).catch(function () {
      loading = false;
      return null;
    });
    return loading;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 앞자리에 못 든 아이에게 줄 말 — 등수 대신 */
  function myLine(r) {
    if (!r.n) return '';
    if (r.myRank && r.myRank <= TOP) {
      return '나는 <b>' + r.myRank + '등</b> · ' + r.mySp + 'P';
    }
    if (r.mySp >= r.avg) {
      return '나는 <b>' + r.mySp + 'P</b> — 우리 반 평균(' + r.avg + 'P)보다 높아요!';
    }
    var gap = r.avg - r.mySp;
    return '나는 <b>' + r.mySp + 'P</b> — 평균까지 ' + gap + 'P 남았어요. 오늘 조금만 더!';
  }

  var MEDAL = ['🥇', '🥈', '🥉', '4', '5'];

  function render(r) {
    var box = $('vg-rank-body');
    if (!box) return;
    if (!r) {
      box.innerHTML = '<p class="empty">반 기록을 불러오지 못했어요. 인터넷을 확인해 주세요.</p>';
      return;
    }
    var c = sess();
    var h = '';

    h += '<div class="rk-sum">'
      + '<div class="rk-card"><div class="k">우리 반이 함께 모은 점수</div>'
      + '<div class="v">' + r.total.toLocaleString() + 'P</div>'
      + '<div class="s">' + r.n + '명이 이번 시즌에</div></div>'
      + '<div class="rk-card"><div class="k">반 평균</div>'
      + '<div class="v">' + r.avg.toLocaleString() + 'P</div>'
      + '<div class="s">한 사람마다</div></div>'
      + '</div>';

    h += '<h4 class="rk-h">이번 시즌 앞자리</h4><div class="rk-list">';
    r.rows.slice(0, TOP).forEach(function (x, i) {
      var mine = c && x.nick === c.nick;
      h += '<div class="rk' + (mine ? ' me' : '') + '">'
        + '<span class="m">' + MEDAL[i] + '</span>'
        + '<span class="n">' + esc(x.nick) + (mine ? ' <em>나</em>' : '') + '</span>'
        + '<span class="lv">Lv.' + x.lv + '</span>'
        + '<span class="p">' + x.sp.toLocaleString() + 'P</span>'
        + '</div>';
    });
    if (!r.rows.length) h += '<p class="empty">아직 아무도 시작하지 않았어요.</p>';
    h += '</div>';

    h += '<div class="rk-me">' + myLine(r) + '</div>';
    h += '<p class="hintnote">앞자리 다섯 명만 이름이 나와요. '
      + '순위는 시즌이 바뀌면 모두 다시 0에서 시작합니다.</p>';

    box.innerHTML = h;
  }

  function open() {
    if (!sess()) return;
    var m = $('vg-rank');
    if (m) m.hidden = false;
    var box = $('vg-rank-body');
    if (box) box.innerHTML = '<p class="empty">불러오는 중…</p>';
    load().then(render);
  }
  function close() {
    var m = $('vg-rank');
    if (m) m.hidden = true;
  }

  function init() {
    var b = $('btn-vg-rank');
    if (b) b.onclick = open;
    var ok = $('vg-rank-ok');
    if (ok) ok.onclick = close;
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open: open, load: load };
})();
