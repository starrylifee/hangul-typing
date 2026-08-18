/* g-doble.js — 타자 도블 (기획 · LEE 팀)
   game_vibe/20260818105020.pdf 의 규칙과 그림을 그대로 옮겼다.

   규칙(원문) 1~5 를 그대로 옮긴 자리
     1. 낱말 5~6개가 있는 카드를 나와 AI 앞에 1장씩, 나머지는 가운데 더미  → deal()
     2. 더미 맨 위 카드는 내 카드·AI 카드와 똑같은 낱말을 하나씩 갖는다   → DECK (사영평면)
     3. 25초 안에 똑같은 낱말을 찾아 친다.
        못 찾거나 잘못 치면 그 카드는 AI 것, 내가 맞히면 내 카드가 늘어난다 → hit() / loseCard()
     4. 총 20장을 다 가져간 뒤 더 많이 가진 쪽이 승리.
        승리하면 "축하합니다!!! 승리하셨습니다~" 와 다시하기·다음단계        → finish() / endScreen()
     5. 기본자리 → 윗자리 → 아랫자리 → ㅃ ㄲ ㄸ ㅆ ㅉ ㅋ ㅐ ㅔ 자리        → STAGES

   ★ 카드 만드는 법
     도블은 "어떤 두 카드를 골라도 공통 낱말이 정확히 하나" 여야 성립한다.
     차수 4의 사영평면(projective plane of order 4)을 쓰면
     21장 × 낱말 5개, 낱말 종류도 21개로 이 조건이 딱 맞는다.
     4는 소수가 아니라 나머지 연산(% 4)으로는 체가 되지 않는다. 그래서 원소가 4개인
     체 GF(4) 의 덧셈(XOR)·곱셈표를 직접 써서 만들었다. 21장 중 20장을 쓴다.
     만든 뒤 checkDeck() 이 모든 쌍(210쌍)을 검산한다.

   ★ 검토에서 고친 것
     - AI 카드는 뒷면으로 덮는다. 예전에는 AI 카드에도 낱말이 또렷이 적혀 있어서
       아이가 "내 카드 ∩ AI 카드" 를 정답으로 알고 치다가 오타로 카드를 뺏겼다.
       맞혀야 하는 건 언제나 "내 카드 ∩ 가운데 카드" 하나뿐이다.
     - 낱말 21개에 저마다 다른 색을 준다. 같은 낱말은 어느 카드에 있어도 같은 색이라
       눈으로 짝을 찾을 수 있다 (도블의 본래 재미).
     - 라운드가 갈수록 제한시간이 줄고, 승부가 갈리면 그 자리에서 끝낸다.
     - 카드 크기는 vh 가 아니라 게임판(stage) 높이로 재서 정한다. 자판 안내를 켜서
       판이 낮아져도 한 화면에 들어간다.
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var LIMIT = 25;          // 규칙 3 — 제한시간 25초 (첫 라운드 값)
  var TOTAL = 20;          // 규칙 4 — 총 카드 20장
  var PER_CARD = 5;        // 규칙 1 — 카드마다 낱말 5~6개 (사영평면 차수 4 → 5개)
  var WRONG_MAX = 5;       // 규칙 3 "잘못 치면" — 다른 낱말을 5번 치면 AI 것 (횟수는 정한 것)

  /* ---------- 라운드가 갈수록 조금씩 빨라진다 ----------
     18라운드가 전부 25초로 똑같아서 뒤쪽이 지루하다는 지적이 있었다.
     첫 라운드는 기획서대로 25초, 라운드마다 0.8초씩 줄이되 12초 밑으로는 안 내린다. */
  var STEP_DOWN = 0.8;
  var MIN_LIMIT = 12;
  function roundLimit(r) { return Math.max(MIN_LIMIT, LIMIT - r * STEP_DOWN); }

  var FAST_BONUS = 5;      // 남은 1초마다 보너스 점수

  /* ---------- 규칙 5 — 단계 ---------- */
  var STAGES = [
    { no: 1, name: '기본자리', pool: function () { return DATA.WORD_UPTO[1]; } },
    { no: 2, name: '윗자리', pool: function () { return DATA.WORD_UPTO[3]; } },
    { no: 3, name: '아랫자리', pool: function () { return DATA.WORD_UPTO[4]; } },
    {
      no: 4, name: 'ㅃ ㄲ ㄸ ㅆ ㅉ ㅋ ㅐ ㅔ 자리',
      pool: function () {
        var p = DATA.WORD_BY_LEVEL[6] || [];
        return p.length >= 30 ? p : DATA.WORDS;
      }
    }
  ];
  var curStage = 1;        // "다음단계" 버튼이 올린다

  /* ---------- 동그란 카드 안 낱말 자리 (그림 그대로 흩어놓기) ----------
     원 안에서 서로 겹치지 않도록 다섯 자리를 미리 잡았다.
     x,y 는 카드 상자의 % 자리 (원의 중심 50,50 · 반지름 50) */
  var SLOT = [
    { x: 50, y: 18 },
    { x: 27, y: 38 },
    { x: 73, y: 38 },
    { x: 50, y: 58 },
    { x: 31, y: 78 },
    { x: 69, y: 78 }      // 낱말이 6개일 때를 위한 여섯 번째 자리
  ];

  /* ---------- 낱말 21개의 색 ----------
     "낱말이 전부 같은 검정이라 색으로 짝을 찾는 재미가 없다" 는 지적을 고쳤다.
     황금각(137.5°)으로 색상을 벌려 서로 붙지 않게 하고, 밝기·채도를 세 단계로
     번갈아 줘서 색상만으로 구분이 안 되는 짝도 갈린다.
     흰 카드 위에 얹히니 밝기는 30~44%(중간 톤) 안에서만 쓴다. 너무 쨍하면 눈이 아프다. */
  var TONE = [
    { s: 62, l: 35 },
    { s: 48, l: 44 },
    { s: 74, l: 30 }
  ];
  function wordColor(i) {
    var h = Math.round((i * 137.508) % 360);
    // 노랑~연두(45~95°)는 같은 밝기라도 밝게 보인다. 조금 더 눌러 준다.
    var t = TONE[i % 3], l = t.l;
    if (h >= 40 && h <= 100) l -= 6;
    if (h >= 170 && h <= 200) l -= 3;
    return 'hsl(' + h + ' ' + t.s + '% ' + l + '%)';
  }

  var G, C, ro = null;

  /* =========================================================
     GF(4) — 원소 4개인 체 (덧셈은 XOR, 곱셈은 표)
     ========================================================= */
  var MUL4 = [
    [0, 0, 0, 0],
    [0, 1, 2, 3],
    [0, 2, 3, 1],
    [0, 3, 1, 2]
  ];
  function gadd(a, b) { return a ^ b; }
  function gmul(a, b) { return MUL4[a][b]; }

  /** 사영평면의 점(=선) 21개를 같은 방식으로 늘어놓는다 */
  function projPoints() {
    var P = [], x, y;
    for (x = 0; x < 4; x++) for (y = 0; y < 4; y++) P.push([1, x, y]);
    for (y = 0; y < 4; y++) P.push([0, 1, y]);
    P.push([0, 0, 1]);
    return P;
  }

  /** 카드 21장 — 각 카드는 낱말 번호 5개 */
  function buildDeck() {
    var P = projPoints(), L = projPoints(), cards = [], i, j;
    for (i = 0; i < L.length; i++) {
      var c = [];
      for (j = 0; j < P.length; j++) {
        var d = gadd(gadd(gmul(P[j][0], L[i][0]), gmul(P[j][1], L[i][1])),
          gmul(P[j][2], L[i][2]));
        if (d === 0) c.push(j);
      }
      cards.push(c);
    }
    return cards;
  }

  /** 검산 — 모든 쌍의 공통 낱말이 정확히 1개인가 */
  function checkDeck(cards) {
    var i, j, k, n;
    for (i = 0; i < cards.length; i++) {
      if (cards[i].length !== PER_CARD) return false;
    }
    for (i = 0; i < cards.length; i++) {
      for (j = i + 1; j < cards.length; j++) {
        n = 0;
        for (k = 0; k < cards[i].length; k++) {
          if (cards[j].indexOf(cards[i][k]) >= 0) n++;
        }
        if (n !== 1) return false;
      }
    }
    return true;
  }

  var DECK = buildDeck();
  var DECK_OK = checkDeck(DECK);

  /** 두 카드의 공통 낱말 번호 (사영평면이라 언제나 하나) */
  function common(a, b) {
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return a[i];
    return -1;
  }

  /* =========================================================
     그림 — 다른 학생 게임(인형·동물)과 같은 손그림 결
     외곽선 #2b241d · 굵기는 viewBox 높이의 2.4% · 모서리 둥글게 · 단색 평면
     ========================================================= */

  /** 카드 뒷면 무늬 — AI 카드는 이걸 덮어쓴다 (여기서 정답을 찾는 게 아니라는 표시) */
  function backSvg() {
    return '<svg class="doble-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="48" fill="#5f6f96"/>' +
      '<circle cx="50" cy="50" r="39" fill="none" stroke="#efe6d4" ' +
      'stroke-width="2.4" stroke-dasharray="5 6"/>' +
      '<path d="M50 20 C55 39 61 45 80 50 C61 55 55 61 50 80 ' +
      'C45 61 39 55 20 50 C39 45 45 39 50 20 Z" fill="#efe6d4"/>' +
      '<circle cx="50" cy="50" r="8.5" fill="#e8b04b"/>' +
      '<circle cx="50" cy="12" r="2.6" fill="#efe6d4" stroke="none"/>' +
      '<circle cx="88" cy="50" r="2.6" fill="#efe6d4" stroke="none"/>' +
      '<circle cx="50" cy="88" r="2.6" fill="#efe6d4" stroke="none"/>' +
      '<circle cx="12" cy="50" r="2.6" fill="#efe6d4" stroke="none"/>' +
      '</svg>';
  }

  /** 가운데 더미의 옆면 — 카드가 쌓인 두께가 아래쪽으로 삐죽 보인다 */
  function stackSvg() {
    return '<svg class="doble-svg doble-stacksvg" viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle cx="52" cy="70" r="46" fill="#b9ac93"/>' +
      '<circle cx="55" cy="65" r="46" fill="#cfc3a9"/>' +
      '<circle cx="60" cy="60" r="46" fill="#e6dbc4"/>' +
      '</svg>';
  }

  /** 승리 화면 장식 — 트로피와 리본 */
  function trophySvg() {
    return '<svg class="doble-svg doble-trophy" viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="M22 34 C10 34 10 50 24 54" fill="none" stroke-width="4.2"/>' +
      '<path d="M78 34 C90 34 90 50 76 54" fill="none" stroke-width="4.2"/>' +
      '<path d="M26 16 h48 v20 C74 52 64 62 50 62 C36 62 26 52 26 36 Z" fill="#f0b73f"/>' +
      '<path d="M44 62 h12 v12 h-12 z" fill="#d99c2b"/>' +
      '<path d="M30 74 h40 v10 h-40 z" fill="#f0b73f"/>' +
      '<path d="M24 84 h52 v8 h-52 z" fill="#c9862188"/>' +
      '<path d="M24 84 h52 v8 h-52 z" fill="#d99c2b"/>' +
      '<path d="M50 26 l4.6 9.4 10.4 1.5 -7.5 7.3 1.8 10.3 -9.3 -4.9 -9.3 4.9 ' +
      '1.8 -10.3 -7.5 -7.3 10.4 -1.5 Z" fill="#fff3d0"/>' +
      '</svg>';
  }

  /* =========================================================
     카드 그리기 — 동그라미 안에 낱말이 여기저기 흩어져 있다
     ========================================================= */
  /** 카드·낱말마다 늘 같은 기울기·크기를 주려고 쓰는 작은 해시 */
  function jit(a, b) {
    var h = (a * 73856093) ^ (b * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 1000) / 1000;
  }

  function cardHtml(card, cid) {
    var out = '';
    for (var i = 0; i < card.length; i++) {
      var s = card[i];
      var p = SLOT[i] || SLOT[0];
      var r1 = jit(cid, s), r2 = jit(s, cid + 7), r3 = jit(cid + 3, s + 5);
      var rot = (r1 * 22 - 11).toFixed(1);          // 기울기 -11° ~ +11°
      var sc = (0.9 + r2 * 0.24).toFixed(2);        // 크기 0.90 ~ 1.14배
      var dx = (p.x + r3 * 3 - 1.5).toFixed(1);
      var dy = (p.y + r1 * 3 - 1.5).toFixed(1);
      out += '<span class="doble-w" data-s="' + s + '" style="left:' + dx + '%;top:' + dy +
        '%;--rot:' + rot + 'deg;--sc:' + sc + ';--wc:' + C.color[s] + '">' +
        A.esc(C.words[s]) + '</span>';
    }
    return out;
  }

  function renderCard(boxId, card, cid) {
    var box = A.el(boxId);
    if (!box) return;
    box.innerHTML = cardHtml(card, cid);
  }

  /** AI 카드는 뒷면으로 덮는다. 보유한 카드 수는 뒷면 위에 그대로 보여 준다. */
  function renderBack(boxId, n) {
    var box = A.el(boxId);
    if (!box) return;
    box.innerHTML = backSvg() + '<span class="doble-backn"><b>' + n + '</b>장</span>';
  }

  function wordEl(boxId, sym) {
    var box = A.el(boxId);
    if (!box) return null;
    return box.querySelector('.doble-w[data-s="' + sym + '"]');
  }

  /* =========================================================
     판 크기 — 게임판(stage) 높이에 맞춰 카드 지름을 px 로 정한다.
     vh 로 잡으면 "⌨️ 자판" 을 켰을 때 판이 낮아지면서 카드가 넘쳐 잘렸다.
     글자 크기도 전부 카드 지름에서 파생시킨다 → 카드 낱말이 늘 화면에서 제일 큰 글자.
     ========================================================= */
  function fit() {
    var tbl = A.el('doble-tbl'), st = A.stage();
    if (!tbl || !st) return;
    var h = st.clientHeight, w = st.clientWidth;
    if (!h || !w) return;
    tbl.dataset.h = h;

    var pile = Math.min(h * 0.66, w * 0.31, 620);
    if (pile < 110) pile = 110;
    var wf = pile * 0.105;                       // 가운데 카드 낱말 (화면에서 제일 큰 글자)

    function px(k, v) { tbl.style.setProperty(k, v.toFixed(1) + 'px'); }
    px('--pile', pile);
    px('--mine', pile * 0.80);
    px('--foe', pile * 0.44);
    px('--wfb', wf);
    px('--wfm', pile * 0.80 * 0.125);
    px('--hud', wf * 0.60);                      // "나"·"AI" — 낱말의 0.6배
    px('--hudb', wf * 0.52);
    px('--sub', wf * 0.40);
    px('--lb', wf * 0.38);
    px('--bar', Math.max(8, pile * 0.045));
  }

  var sizeHooked = false;
  function watchSize() {
    var st = A.stage();
    if (!sizeHooked) {
      sizeHooked = true;
      window.addEventListener('resize', function () { if (C) fit(); });
    }
    if (ro) { try { ro.disconnect(); } catch (e) { } ro = null; }
    if (window.ResizeObserver && st) {
      ro = new window.ResizeObserver(function () { fit(); });
      ro.observe(st);
    }
  }

  /* =========================================================
     인트로 (엔터 → 3·2·1 → 시작)
     ========================================================= */
  function miniCard(list, cols) {
    var s = '<span class="doble-minic">';
    for (var i = 0; i < list.length; i++) {
      s += '<i style="color:' + cols[i] + '">' + A.esc(list[i]) + '</i>';
    }
    return s + '</span>';
  }

  function introHtml() {
    var st = STAGES[curStage - 1];
    var c0 = wordColor(0), c1 = wordColor(4), c2 = wordColor(8),
      c3 = wordColor(13), c4 = wordColor(17);
    return '<div class="doble-introbg"></div>' +
      '<div class="gintro-box doble-introbox">' +
      '  <p class="gintro-by">학생이 만든 게임 · 기획 LEE 팀</p>' +
      '  <h2>타자 도블</h2>' +
      '  <p class="gintro-desc"><b>내 카드</b>와 <b>가운데 더미 맨 위 카드</b>에<br>' +
      '     똑같이 들어 있는 낱말이 <b>딱 하나</b> 있어요. 찾아서 치세요!</p>' +
      '  <div class="doble-introrow">' +
      miniCard(['아이', '어머니', '몸'], [c0, c1, c2]) +
      '    <span class="doble-eq">＝</span>' +
      miniCard(['아이', '허리', '말'], [c0, c3, c4]) +
      '    <span class="doble-eq">·</span>' +
      '    <span class="doble-minic back">' + backSvg() +
      '      <em>AI 카드는<br>뒤집혀 있어요</em></span>' +
      '  </div>' +
      '  <p class="gintro-hint">같은 낱말은 <b>어느 카드에서나 같은 색</b>이에요<br>' +
      LIMIT + '초 안에 못 찾거나 다른 낱말을 치면 그 카드는 컴퓨터 것 · ' +
      '남은 시간은 점수(1초 +' + FAST_BONUS + '점)<br>' +
      '카드 ' + TOTAL + '장을 다 나눠 가진 뒤 더 많이 가진 쪽이 승리 · ' +
      '지금은 <b>' + st.no + '단계 · ' + A.esc(st.name) + '</b></p>' +
      '  <p class="gintro-go">엔터를 누르면 시작해요</p>' +
      '</div>';
  }

  /* =========================================================
     시작
     ========================================================= */
  function start() {
    A.prepare('doble', introHtml());
    G = A.state();

    var st = STAGES[curStage - 1];
    // 단계마다 최고 기록을 따로 남긴다 — 안 그러면 "다음단계" 를 누르는 순간
    // 1단계에서 세운 기록을 다시는 못 넘는다
    A.recKey(st.no + '단계');

    var table = document.createElement('div');
    table.className = 'doble-table';
    table.id = 'doble-tbl';
    table.innerHTML =
      '<div class="doble-top">' +
      '  <div class="doble-side me">' +
      '    <span class="who">나</span>' +
      '    <span class="have">보유한 카드 <b id="doble-mycnt">1</b>장</span>' +
      '  </div>' +
      '  <div class="doble-mid">' +
      '    <div class="doble-stg"><b id="doble-stgno">' + st.no + '단계</b>' +
      '       <span id="doble-stgnm">· ' + A.esc(st.name) + '</span></div>' +
      '    <div class="doble-time">' +
      '      <div class="lb">시간 <b id="doble-sec">' + LIMIT + '</b>초 남음' +
      '        <em id="doble-bonus">지금 맞히면 +0점</em></div>' +
      '      <div class="bar" id="doble-tbar"><i id="doble-tb"></i></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="doble-side ai">' +
      '    <span class="who">AI</span>' +
      '    <span class="have">보유한 카드 <b id="doble-aicnt">1</b>장</span>' +
      '  </div>' +
      '</div>' +
      '<div class="doble-row" id="doble-rowbox">' +
      '  <div class="doble-col">' +
      '    <div class="doble-lb">내 카드</div>' +
      '    <div class="doble-card mine" id="doble-my"></div>' +
      '  </div>' +
      '  <div class="doble-col mid">' +
      '    <div class="doble-lb">가운데 카드 더미 <b id="doble-left">18</b>장</div>' +
      '    <div class="doble-pilebox">' + stackSvg() +
      '      <div class="doble-card big" id="doble-pile"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="doble-col foe">' +
      '    <div class="doble-lb">AI 카드 <span class="dim">(뒤집힘)</span></div>' +
      '    <div class="doble-card foe back" id="doble-ai"></div>' +
      '  </div>' +
      '</div>' +
      '<p class="doble-tip"><b>내 카드</b>와 <b>가운데 카드</b>에 똑같이 있는 낱말 하나를 찾아 치세요' +
      '<span class="doble-wrong" id="doble-wrong"></span>' +
      (DECK_OK ? '' : ' · (카드 검산 실패)') + '</p>';
    A.stage().appendChild(table);

    /* ---------- 규칙 1 — 카드를 나눈다 ---------- */
    var cards = DATA.shuffle(DECK.slice()).slice(0, TOTAL);   // 21장 중 20장
    var cols = [], i;
    for (i = 0; i < 21; i++) cols.push(wordColor(i));
    C = {
      words: pickWords(curStage), color: cols,
      my: cards[0], ai: cards[1], pile: cards.slice(2),       // 나 1 · AI 1 · 더미 18
      myId: 0, aiId: 1, pileId: 2,
      myN: 1, aiN: 1, total: cards.length,
      round: 0, rounds: cards.length - 2, streak: 0, bonusSum: 0,
      timeLeft: LIMIT, limit: LIMIT, errBase: 0, phase: 'wait', answer: -1,
      myAns: null, tick: 0
    };
    G.doble = C;
    G.items = [];

    renderCard('doble-my', C.my, C.myId);
    renderBack('doble-ai', C.aiN);
    showCount();
    fit();
    watchSize();
    setTimeout(fit, 60);
    nextRound();
  }

  function showCount() {
    A.el('doble-mycnt').textContent = C.myN;
    A.el('doble-aicnt').textContent = C.aiN;
    A.el('doble-left').textContent = C.pile.length;
  }

  function showTime() {
    var s = A.el('doble-sec'), b = A.el('doble-tb'), box = A.el('doble-tbar');
    if (!s || !b) return;
    var left = Math.max(0, C.timeLeft);
    s.textContent = Math.ceil(left);
    b.style.width = (left / C.limit * 100) + '%';
    if (box) box.classList.toggle('hot', left <= C.limit * 0.32);
    var bo = A.el('doble-bonus');
    if (bo) bo.textContent = '지금 맞히면 +' + (Math.ceil(left) * FAST_BONUS) + '점';
  }

  /* =========================================================
     낱말 고르기 — 규칙 5: 단계에 맞는 자리의 낱말만
     ========================================================= */
  function pickWords(stage) {
    var pool = (STAGES[stage - 1].pool() || []).slice();
    // 동그란 카드 안에 다섯 개가 겹치지 않고 읽히도록 2~4글자만 쓴다
    var fit2 = pool.filter(function (w) {
      return w.length >= 2 && w.length <= 4 && A.keyLen(w) <= 8;
    });
    if (fit2.length >= 21) pool = fit2;
    if (pool.length < 21) pool = DATA.WORDS.slice();

    var out = [], seen = {};
    var mix = DATA.shuffle(pool.slice());
    for (var i = 0; i < mix.length && out.length < 21; i++) {
      if (seen[mix[i]]) continue;
      seen[mix[i]] = 1;
      out.push(mix[i]);
    }
    return out;
  }

  /* =========================================================
     한 판 — 규칙 2: 더미 맨 위 카드는 내 카드와 공통 낱말이 하나
     ========================================================= */
  function nextRound() {
    if (!C) return;
    if (!C.pile.length) { finish(false); return; }
    // 승부가 갈렸으면 그 자리에서 끝 — 남은 카드를 몰아 줘도 뒤집을 수 없다
    if (Math.abs(C.myN - C.aiN) > C.pile.length) { finish(true); return; }

    var top = C.pile[0];
    C.pileId = C.total - C.pile.length + 2;
    renderCard('doble-pile', top, C.pileId);
    var pileBox = A.el('doble-pile');
    pileBox.classList.remove('to-me', 'to-ai', 'shake');
    pileBox.style.removeProperty('--fx');
    pileBox.style.removeProperty('--fy');
    void pileBox.offsetWidth;
    pileBox.classList.add('in');
    // 들어오는 움직임이 끝나면 클래스를 뗀다.
    // 안 떼면 나중에 흔들림(shake)을 붙였다 뗄 때 들어오는 움직임이 다시 재생돼
    // 카드가 잠깐 사라진 것처럼 보인다.
    setTimeout(function () {
      var e = A.el('doble-pile');
      if (e) e.classList.remove('in');
    }, 420);

    // 진 판에서는 내 카드가 그대로 남는다. 지난 판의 빨간 표시를 지우고 시작한다.
    var mine = A.el('doble-my').querySelectorAll('.doble-w');
    for (var m = 0; m < mine.length; m++) {
      mine[m].classList.remove('dmiss');
      mine[m].classList.remove('found');
      mine[m].classList.remove('lock');
      mine[m].textContent = C.words[mine[m].getAttribute('data-s')];
    }

    C.answer = common(C.my, top);
    C.myAns = wordEl('doble-my', C.answer);

    var wEl = wordEl('doble-pile', C.answer);
    var item = {
      word: C.words[C.answer], el: pileBox, wEl: wEl,
      lock: false, matched: 0, dead: false
    };
    G.items = [item];                 // 정답 낱말 하나만 — 다른 걸 치면 엔진이 오타로 잡는다

    C.limit = roundLimit(C.round);
    C.timeLeft = C.limit;
    C.errBase = G.errors;
    C.wrongShown = -1;
    C.phase = 'play';
    showTime();
    showCount();
    A.progress(C.round / C.rounds);
    draw();
  }

  /* =========================================================
     매 프레임 — 규칙 3: 카운트다운
     ========================================================= */
  function step(dt) {
    if (!C || C.phase !== 'play') return;
    C.timeLeft -= dt;
    showTime();
    // 자판 안내를 켜고 끄면 판 높이가 바뀐다. 몇 프레임에 한 번 확인해 다시 맞춘다.
    C.tick++;
    if (C.tick % 12 === 0) {
      var tbl = A.el('doble-tbl'), st = A.stage();
      if (tbl && st && String(st.clientHeight) !== tbl.dataset.h) fit();
    }
    // "잘못 치면" — 다른 낱말을 여러 번 치면 그 카드는 AI 것
    var wrong = G.errors - C.errBase;
    if (wrong !== C.wrongShown) {
      if (wrong > C.wrongShown && C.wrongShown >= 0) shake();
      C.wrongShown = wrong;
      var we = A.el('doble-wrong');
      if (we) we.textContent = wrong > 0 ? ' · 잘못 친 횟수 ' + wrong + ' / ' + WRONG_MAX : '';
    }
    if (wrong >= WRONG_MAX) { loseCard('잘못 쳤어요'); return; }
    if (C.timeLeft <= 0) { A.sfx('bad'); loseCard('시간이 다 됐어요'); }
  }

  /** 오답 — 카드가 부르르 떨린다 */
  function shake() {
    ['doble-pile', 'doble-my'].forEach(function (id) {
      var e = A.el(id);
      if (!e) return;
      e.classList.remove('shake');
      void e.offsetWidth;
      e.classList.add('shake');
      setTimeout(function () { if (e) e.classList.remove('shake'); }, 460);
    });
  }

  /** 날아갈 곳을 픽셀로 재 둔다 (판 높이가 달라져도 제자리로 날아간다) */
  function flyTo(fromId, toId) {
    var a = A.el(fromId), b = A.el(toId);
    if (!a || !b) return;
    var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    a.style.setProperty('--fx', Math.round(rb.left + rb.width / 2 - ra.left - ra.width / 2) + 'px');
    a.style.setProperty('--fy', Math.round(rb.top + rb.height / 2 - ra.top - ra.height / 2) + 'px');
  }

  /* ---------- 성공 — 규칙 3: 내 카드 수가 늘어난다 ---------- */
  function hit(item) {
    if (!C || C.phase !== 'play') return;
    item.dead = true;
    G.items = [];
    C.phase = 'anim';

    A.addScore(item.word);
    // 빨리 치면 이득 — 남은 1초마다 보너스
    var bonus = Math.max(0, Math.ceil(C.timeLeft)) * FAST_BONUS;
    if (bonus > 0) { A.bump(bonus); C.bonusSum += bonus; }

    C.myN++;
    C.round++;
    C.streak++;

    var got = C.pile.shift();
    var pileBox = A.el('doble-pile');
    flyTo('doble-pile', 'doble-my');
    pileBox.classList.remove('in');
    pileBox.classList.add('to-me');
    if (C.myAns) C.myAns.classList.add('found');

    // 이 게임의 유일한 성취는 "카드를 가져오는 것" 이다.
    // 다만 매번 크게 터뜨리면 지겨우니 연속·고비에서만 크게 축하한다.
    var big = (C.streak === 3 || C.streak === 5 ||
      (C.streak >= 7 && C.streak % 2 === 1) || C.myN === 5 || C.myN === 10);
    if (big) {
      A.cheer({
        icon: '🃏', name: '카드 ' + C.myN + '장!',
        sub: '"' + item.word + '" · 연속 ' + C.streak + '장 · 시간 보너스 +' + bonus + '점',
        color: '#7ee7c4'
      });
    } else {
      A.flashItem({
        icon: '🃏', name: '"' + item.word + '" 정답! 카드 획득 · +' + bonus + '점',
        color: '#7ee7c4'
      });
    }

    setTimeout(function () {
      if (!C || !G || G.over) return;
      C.my = got;                       // 가져온 카드가 내 새 카드가 된다
      C.myId = C.pileId;
      renderCard('doble-my', C.my, C.myId);
      A.el('doble-my').classList.add('pop');
      setTimeout(function () {
        var e = A.el('doble-my');
        if (e) e.classList.remove('pop');
      }, 380);
      nextRound();
    }, 620);
  }

  /* ---------- 실패 — 규칙 3: 그 카드는 AI 것이 된다 ---------- */
  function loseCard(why) {
    if (!C || C.phase !== 'play') return;
    C.phase = 'anim';
    G.items.forEach(function (it) { it.dead = true; });
    G.items = [];
    A.breakCombo();
    C.aiN++;
    C.round++;
    C.streak = 0;
    C.timeLeft = 0;
    showTime();

    var got = C.pile.shift();
    var pileBox = A.el('doble-pile');
    flyTo('doble-pile', 'doble-ai');
    pileBox.classList.remove('in');
    pileBox.classList.add('to-ai');
    // 못 찾은 낱말을 알려 준다
    var ans = wordEl('doble-pile', C.answer);
    if (ans) ans.classList.add('dmiss');
    if (C.myAns) C.myAns.classList.add('dmiss');

    A.flashItem({
      icon: '🤖', name: why + ' — "' + C.words[C.answer] + '" · AI가 카드를 가져갔어요',
      color: '#ff6b81'
    });

    setTimeout(function () {
      if (!C || !G || G.over) return;
      C.ai = got;                       // AI가 가져간 카드가 AI의 새 카드가 된다
      C.aiId = C.pileId;
      renderBack('doble-ai', C.aiN);
      var e = A.el('doble-ai');
      if (e) {
        e.classList.add('pop');
        setTimeout(function () { if (e) e.classList.remove('pop'); }, 380);
      }
      nextRound();
    }, 900);
  }

  /* =========================================================
     규칙 4 — 20장을 다 가져간 뒤 더 많이 가진 쪽이 승리
     ========================================================= */
  function finish(early) {
    C.phase = 'end';
    A.progress(1);
    var win = C.myN > C.aiN;
    var msg = win
      ? '🏆 나 ' + C.myN + '장 · AI ' + C.aiN + '장 — 승리!'
      : (C.myN === C.aiN
        ? '🤝 나 ' + C.myN + '장 · AI ' + C.aiN + '장 — 비겼어요'
        : '🤖 나 ' + C.myN + '장 · AI ' + C.aiN + '장 — 아쉬워요');
    var me = C.myN, ai = C.aiN, left = C.pile.length, bonus = C.bonusSum;
    if (win) A.cheer({ icon: '🏆', name: '승리!', sub: '나 ' + me + '장 · AI ' + ai + '장', color: '#ffd166' });
    A.gameOver(msg, win);
    endScreen(win, me, ai, early ? left : 0, bonus);
  }

  /** 기획서 3쪽 그림 — 축하합니다!!! / 승리하셨습니다~ / 다시하기 · 다음단계 */
  function endScreen(win, me, ai, left, bonus) {
    var last = curStage >= STAGES.length;
    var ov = document.createElement('div');
    ov.className = 'doble-end' + (win ? ' win' : '');
    ov.innerHTML =
      '<div class="doble-endtop">' +
      '  <div class="doble-side me"><span class="who">나</span>' +
      '    <span class="have">보유한 카드 ' + me + '장</span></div>' +
      '  <div class="doble-side ai"><span class="who">AI</span>' +
      '    <span class="have">보유한 카드 ' + ai + '장</span></div>' +
      '</div>' +
      '<div class="doble-endmid">' +
      (win ? trophySvg() : '') +
      (win
        ? '<h2>축하합니다!!!</h2><p>승리하셨습니다~</p>'
        : (me === ai
          ? '<h2>비겼습니다</h2><p>한 장 차이로 갈려요, 다시 해 볼까요?</p>'
          : '<h2>아쉬워요</h2><p>AI가 카드를 더 많이 가져갔어요</p>')) +
      (left > 0
        ? '<p class="doble-endnote">남은 ' + left + '장을 다 가져가도 승부가 안 바뀌어 여기서 끝냈어요</p>'
        : '') +
      (bonus > 0
        ? '<p class="doble-endnote">빨리 쳐서 받은 시간 보너스 <b>+' + bonus + '점</b></p>'
        : '') +
      '  <div class="doble-endbtns">' +
      '    <button class="doble-btn" id="doble-again">다시하기</button>' +
      (win && !last ? '<button class="doble-btn go" id="doble-next">다음단계</button>' : '') +
      (win && last ? '<button class="doble-btn go" id="doble-first">처음 단계로</button>' : '') +
      '  </div>' +
      '  <button class="doble-more" id="doble-more">점수·타수 보기</button>' +
      '</div>';
    A.stage().appendChild(ov);

    A.el('doble-again').onclick = function () { GAMES.start('doble'); };
    if (A.el('doble-next')) {
      A.el('doble-next').onclick = function () {
        curStage = Math.min(STAGES.length, curStage + 1);
        GAMES.start('doble');
      };
    }
    if (A.el('doble-first')) {
      A.el('doble-first').onclick = function () { curStage = 1; GAMES.start('doble'); };
    }
    A.el('doble-more').onclick = function () { ov.remove(); };
    A.el('doble-again').focus();
  }

  /* ---------- 낱말 표시 갱신 ---------- */
  function draw() {
    if (!C || !G || !G.items.length) return;
    var it = G.items[0];
    if (!it || it.dead) return;
    if (it.wEl) {
      it.wEl.innerHTML = A.wordHtml(it);
      it.wEl.classList.toggle('lock', !!it.lock);
    }
    if (C.myAns) {
      C.myAns.innerHTML = A.wordHtml(it);
      C.myAns.classList.toggle('lock', !!it.lock);
    }
  }

  GAMES.register('doble', {
    name: '타자 도블', credit: 'LEE 팀', icon: '🃏',
    desc: '내 카드와 가운데 카드에 똑같이 있는 낱말을 찾아 치세요. 25초 안에 못 찾으면 그 카드는 컴퓨터 것이 돼요!',
    pdf: 'game_vibe/20260818105020.pdf',
    start: start, step: step, hit: hit, draw: draw
  });

  // 검산용 — node -e 로 덱을 확인할 때 쓴다
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildDeck: buildDeck, checkDeck: checkDeck };
  }
})();
