/* =========================================================
   guest.js — 로그인하지 않은 학생의 게임 시간 제한
   한 판 1분, 하루 통틀어 5분까지. 연습(타자 연습)은 제한하지 않는다.
   게임만 하러 들어오는 아이를 막되, 타자 연습을 하러 온 아이는 막지 않는다.
   반에 로그인하면 제한이 사라진다 (그때부터는 교사가 정한 요일·시간 규칙만 적용).
   ========================================================= */
var GUEST = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var PER_ROUND = 60;      // 한 판에 줄 시간(초)
  var DAILY = 300;         // 하루 통틀어 줄 시간(초)

  /** 로그인 안 한 상태인가 */
  function isGuest() {
    return !(window.APP && APP.rec && APP.rec.cloud);
  }

  /* 쓴 시간은 학습 기록(APP.rec)과 따로 둔다.
     같이 두면 홈의 "기록 지우기" 한 번, 학생 이름 바꾸기 한 번으로
     제한이 초기화돼서 하루 5분이 아무 의미가 없어진다.
     이 제한은 학생이 아니라 "이 기기" 단위다. */
  var STORE = 'hangul_guest_v1';
  var cache = null;

  /** 오늘 쓴 시간 주머니. 날짜가 바뀌면 새로 채워진다. */
  function bag() {
    var t = APP.todayKey();
    if (!cache) {
      try { cache = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { cache = null; }
    }
    if (!cache || cache.date !== t) cache = { date: t, used: 0 };
    return cache;
  }
  function store() {
    try { localStorage.setItem(STORE, JSON.stringify(bag())); } catch (e) { }
  }

  function remainToday() {
    if (!isGuest()) return Infinity;
    return Math.max(0, DAILY - (bag().used || 0));
  }
  /** 이번 판에 줄 시간 — 하루 남은 시간이 1분보다 적으면 그만큼만 */
  function roundSec() {
    return Math.min(PER_ROUND, remainToday());
  }
  function canPlay() {
    return !isGuest() || remainToday() > 0;
  }

  function mmss(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  /* ---------- 화면의 스톱워치 ---------- */
  var left = 0, tm = null, onEnd = null;

  function badge() { return $('g-guest'); }

  function paint() {
    var b = badge();
    if (!b) return;
    b.hidden = false;
    b.textContent = '⏱ ' + mmss(left);
    b.classList.toggle('hot', left <= 10);
    b.title = '로그인하지 않으면 게임은 한 판 1분, 하루 5분까지 할 수 있어요.'
      + ' (오늘 남은 시간 ' + mmss(remainToday()) + ')';
  }
  function hide() {
    var b = badge();
    if (b) { b.hidden = true; b.classList.remove('hot'); }
  }

  /** 게임이 실제로 돌아가는 중일 때만 시간이 줄어든다 (인트로·카운트다운 중엔 안 줄어듦).
      다른 탭으로 넘어가면 게임 자체가 멈추므로(requestAnimationFrame) 시계도 멈춘다.
      안 그러면 잠깐 딴 데 보고 온 아이가 하지도 않은 시간을 뺏긴다. */
  function playing() {
    if (document.hidden) return false;
    if (!window.GAMES || !GAMES.api || !GAMES.api.state) return false;
    var g = GAMES.api.state();
    return !!(g && g.running && !g.over);
  }

  function tick() {
    if (!isGuest()) { stopTimer(); hide(); return; }   // 게임 중에 로그인했다면 제한 해제
    if (!playing()) return;
    left--;
    var b = bag();
    b.used = (b.used || 0) + 1;
    paint();
    if (left % 5 === 0 || left <= 0) store();
    if (left <= 0) {
      stopTimer();
      if (onEnd) onEnd();
    }
  }

  function stopTimer() {
    clearInterval(tm);
    tm = null;
  }

  /**
   * 게임을 시작할 때 games.js 가 불러 준다.
   * @param cb 시간이 다 됐을 때 부를 함수
   * @return  시작해도 되면 true
   */
  function begin(cb) {
    stopTimer();
    if (!isGuest()) { hide(); return true; }
    left = roundSec();
    if (left <= 0) { hide(); return false; }
    onEnd = cb;
    paint();
    tm = setInterval(tick, 1000);
    return true;
  }

  /** 게임이 끝나거나 나갈 때 — 시계를 멈추고 쓴 시간을 저장한다 */
  function end() {
    stopTimer();
    store();
    hide();
  }

  return {
    isGuest: isGuest, canPlay: canPlay, remainToday: remainToday,
    roundSec: roundSec, mmss: mmss, begin: begin, end: end,
    PER_ROUND: PER_ROUND, DAILY: DAILY
  };
})();
