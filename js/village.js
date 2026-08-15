/* =========================================================
   village.js — 내 마을: 타자 포인트로 마을이 자라난다
   반 로그인(cloud) 학생 전용. 포인트가 쌓이면 건물·주민이 하나씩 생긴다.
   그림은 village-art.js 의 VILLAGE_ART 를 쓴다.
   ========================================================= */
var VILLAGE = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* 포인트 순서대로 열리는 마을. 하루 최대 100P 기준으로
     매일 한두 개씩 새 것이 생기게 간격을 잡았다. */
  var MILESTONES = [
    { p: 0,   key: 'house1',   name: '작은 오두막' },
    { p: 30,  key: 'tree1',    name: '둥근 나무' },
    { p: 60,  key: 'flower',   name: '꽃밭' },
    { p: 100, key: 'rabbit',   name: '토끼' },
    { p: 150, key: 'house2',   name: '아담한 집' },
    { p: 210, key: 'tree2',    name: '전나무' },
    { p: 270, key: 'bird',     name: '파랑새' },
    { p: 340, key: 'shop',     name: '가게' },
    { p: 420, key: 'cat',      name: '고양이' },
    { p: 500, key: 'fountain', name: '분수대' },
    { p: 590, key: 'dog',      name: '강아지' },
    { p: 690, key: 'house3',   name: '2층집' },
    { p: 800, key: 'school',   name: '학교' }
  ];

  /* 자리 배치 — left / bottom / width (%)
     뒷줄 건물(b 25~27) → 중간 나무 → 앞줄 동물·분수(크게, 원근).
     분수를 중앙 광장으로 삼고 동물들이 그 주변에 모이게 했다. */
  var SLOTS = {
    house1:   { l: 6,    b: 26, w: 12 },
    tree1:    { l: 15,   b: 24, w: 8.5 },
    flower:   { l: 62,   b: 8,  w: 8 },
    cat:      { l: 18,   b: 5,  w: 6.5 },
    rabbit:   { l: 36,   b: 6,  w: 6.5 },
    house2:   { l: 37,   b: 26, w: 13 },
    tree2:    { l: 49.5, b: 24.5, w: 8 },
    bird:     { l: 68,   b: 9,  w: 5 },
    shop:     { l: 58,   b: 26, w: 11 },
    fountain: { l: 44,   b: 3,  w: 12 },
    dog:      { l: 55,   b: 5,  w: 6.5 },
    house3:   { l: 72,   b: 25, w: 13.5 },
    school:   { l: 86,   b: 25, w: 12 }
  };

  /* 풀밭 전체를 덮는 언덕 — 하늘과 맞닿는 능선이 곡선이 된다.
     height:100% 인라인 스타일은 전역 .vg-item svg { height:auto } 를 이기기 위한 것 */
  var HILL_SVG = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:100%" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 10 Q12 2 26 7 Q40 12 52 6 Q66 0 80 7 Q90 11 100 6 L100 40 L0 40 Z" fill="#a8e6a3"/>'
    + '<path d="M0 18 Q20 12 45 16 Q70 20 100 14 L100 40 L0 40 Z" fill="#98dd93"/>'
    + '<path d="M0 30 Q30 26 60 29 Q80 31 100 28 L100 40 L0 40 Z" fill="#8fd98a"/></svg>';

  /* 광장에서 좌우 화면 밖까지 이어지는 흙길 */
  var PATH_SVG = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 24 Q20 21 38 15 Q48 12 58 14 Q76 17 92 12 Q97 10.8 100 10 L100 14 '
    + 'Q97 14.8 92 16 Q76 21 58 18 Q48 16 40 19 Q22 25 0 26 Z" fill="#e8dcc0" opacity="0.85"/></svg>';

  function sess() { return APP.rec.cloud || null; }
  function points() { var c = sess(); return c ? (c.points || 0) : 0; }

  function unlocked(p) {
    return MILESTONES.filter(function (m) { return p >= m.p; });
  }
  function nextOne(p) {
    for (var i = 0; i < MILESTONES.length; i++) {
      if (p < MILESTONES[i].p) return MILESTONES[i];
    }
    return null;
  }

  /* ---------- 화면 ---------- */
  function open() {
    render();
    APP.show('village');
  }

  function render() {
    var c = sess();
    if (!c) return;
    var p = points();

    $('vg-stat').textContent = c.nick + '의 마을 · ' + p + 'P · Lv.' + (c.level || 1);

    /* 마을 장면 */
    var scene = $('vg-scene');
    var html = '';
    // 하늘 장식은 처음부터
    html += item('sun', { l: 88, t: 6, w: 7 }, null, 'vg-sky');
    html += item('cloud', { l: 6, t: 8, w: 11 }, null, 'vg-sky');
    html += item('cloud', { l: 30, t: 4, w: 8 }, null, 'vg-sky');
    // 뒷동산 — 직선 지평선을 언덕 실루엣으로 가린다
    html += '<div class="vg-item vg-sky" style="left:0;bottom:0;width:100%;height:56%">' + HILL_SVG + '</div>';
    // 길
    html += '<div class="vg-item vg-sky" style="left:0;bottom:0;width:100%">' + PATH_SVG + '</div>';
    unlocked(p).forEach(function (m) {
      var s = SLOTS[m.key];
      if (s) html += item(m.key, s, m.name, m.key === justKey ? 'pop' : '');
    });
    justKey = null;
    scene.innerHTML = html;

    /* 다음 목표 */
    var nx = nextOne(p);
    if (nx) {
      var prev = 0;
      MILESTONES.forEach(function (m) { if (m.p <= p && m.p > prev) prev = m.p; });
      var ratio = (p - prev) / (nx.p - prev);
      $('vg-next').textContent = '다음 목표: ' + nx.name + '까지 ' + (nx.p - p) + 'P 남음 — 연습하면 포인트가 쌓여요!';
      $('vg-bar').style.width = Math.round(ratio * 100) + '%';
    } else {
      $('vg-next').textContent = '마을을 모두 완성했어요! 정말 대단해요 🎉';
      $('vg-bar').style.width = '100%';
    }
  }

  function item(key, s, title, cls) {
    var pos = s.t != null
      ? 'top:' + s.t + '%;'
      : 'bottom:' + s.b + '%;';
    return '<div class="vg-item' + (cls ? ' ' + cls : '') + '" style="left:' + s.l + '%;'
      + pos + 'width:' + s.w + '%"'
      + (title ? ' title="' + title + '"' : '') + '>'
      + (VILLAGE_ART[key] || '') + '</div>';
  }

  var justKey = null;      // 방금 새로 열린 것 — 등장 연출용

  /* ---------- 포인트가 오를 때 (cloud.js 가 불러 준다) ---------- */
  function onPoints(before, after) {
    var fresh = MILESTONES.filter(function (m) { return m.p > before && m.p <= after && m.p > 0; });
    fresh.forEach(function (m) {
      APP.toast('🏘️ 마을에 「' + m.name + '」이 생겼어요! 내 마을에서 확인해 보세요.');
      justKey = m.key;
    });
    // 마을 화면을 보는 중이면 바로 다시 그린다
    var sec = $('s-village');
    if (sec && sec.classList.contains('on')) render();
  }

  function updateButton() {
    var b = $('btn-village');
    if (b) b.hidden = !sess();
  }

  function init() {
    var b = $('btn-village');
    if (!b) return;
    b.onclick = open;
    updateButton();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open: open, render: render, onPoints: onPoints, updateButton: updateButton };
})();
