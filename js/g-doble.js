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
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var LIMIT = 25;          // 규칙 3 — 제한시간 25초
  var TOTAL = 20;          // 규칙 4 — 총 카드 20장
  var PER_CARD = 5;        // 규칙 1 — 카드마다 낱말 5~6개 (사영평면 차수 4 → 5개)
  var WRONG_MAX = 5;       // 규칙 3 "잘못 치면" — 다른 낱말을 5번 치면 AI 것 (횟수는 정한 것)

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
    { x: 50, y: 17 },
    { x: 24, y: 37 },
    { x: 76, y: 37 },
    { x: 50, y: 57 },
    { x: 29, y: 77 },
    { x: 71, y: 77 }      // 낱말이 6개일 때를 위한 여섯 번째 자리
  ];

  var G, C;

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
     낱말 고르기 — 규칙 5: 단계에 맞는 자리의 낱말만
     ========================================================= */
  function pickWords(stage) {
    var pool = (STAGES[stage - 1].pool() || []).slice();
    // 동그란 카드 안에 다섯 개가 겹치지 않고 읽히도록 2~4글자만 쓴다
    var fit = pool.filter(function (w) {
      return w.length >= 2 && w.length <= 4 && A.keyLen(w) <= 8;
    });
    if (fit.length >= 21) pool = fit;
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
      var rot = (r1 * 26 - 13).toFixed(1);          // 기울기 -13° ~ +13°
      var sc = (0.88 + r2 * 0.3).toFixed(2);        // 크기 0.88 ~ 1.18배
      var dx = (p.x + r3 * 4 - 2).toFixed(1);
      var dy = (p.y + r1 * 4 - 2).toFixed(1);
      out += '<span class="doble-w" data-s="' + s + '" style="left:' + dx + '%;top:' + dy +
        '%;--rot:' + rot + 'deg;--sc:' + sc + '">' + A.esc(C.words[s]) + '</span>';
    }
    return out;
  }

  function renderCard(boxId, card, cid) {
    var box = A.el(boxId);
    if (!box) return;
    box.innerHTML = cardHtml(card, cid);
  }

  function wordEl(boxId, sym) {
    var box = A.el(boxId);
    if (!box) return null;
    return box.querySelector('.doble-w[data-s="' + sym + '"]');
  }

  /* =========================================================
     인트로 (엔터 → 3·2·1 → 시작)
     ========================================================= */
  function introHtml() {
    var st = STAGES[curStage - 1];
    return '<div class="doble-introbg"></div>' +
      '<div class="gintro-box doble-introbox">' +
      '  <p class="gintro-by">학생이 만든 게임 · 기획 LEE 팀</p>' +
      '  <h2>타자 도블</h2>' +
      '  <p class="gintro-desc"><b>내 카드</b>와 <b>가운데 더미 맨 위 카드</b>에<br>' +
      '     똑같이 들어 있는 낱말이 <b>딱 하나</b> 있어요. 찾아서 치세요!</p>' +
      '  <div class="doble-introrow">' +
      '    <span class="doble-minic"><i>아이</i><i>어머니</i><i>몸</i></span>' +
      '    <span class="doble-eq">＝</span>' +
      '    <span class="doble-minic"><i>아이</i><i>허리</i><i>말</i></span>' +
      '  </div>' +
      '  <p class="gintro-hint">' + LIMIT + '초 안에 못 찾거나 다른 낱말을 치면 그 카드는 컴퓨터 것이 돼요<br>' +
      '     카드 ' + TOTAL + '장을 다 나눠 가진 뒤 더 많이 가진 쪽이 이깁니다 · ' +
      '     지금은 <b>' + st.no + '단계 · ' + A.esc(st.name) + '</b></p>' +
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
    var table = document.createElement('div');
    table.className = 'doble-table';
    table.innerHTML =
      '<div class="doble-top">' +
      '  <div class="doble-side me">' +
      '    <span class="who">나</span>' +
      '    <span class="have">보유한 카드 <b id="doble-mycnt">1</b>장</span>' +
      '  </div>' +
      '  <div class="doble-stg"><b id="doble-stgno">' + st.no + '단계</b>' +
      '     <span id="doble-stgnm">· ' + A.esc(st.name) + '</span></div>' +
      '  <div class="doble-side ai">' +
      '    <span class="who">AI</span>' +
      '    <span class="have">보유한 카드 <b id="doble-aicnt">1</b>장</span>' +
      '    <div class="doble-time">' +
      '      <div class="lb">시간 <b id="doble-sec">' + LIMIT + '</b>초 남음</div>' +
      '      <div class="bar" id="doble-tbar"><i id="doble-tb"></i></div>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="doble-row">' +
      '  <div class="doble-col">' +
      '    <div class="doble-lb">내 카드</div>' +
      '    <div class="doble-card small" id="doble-my"></div>' +
      '  </div>' +
      '  <div class="doble-col mid">' +
      '    <div class="doble-lb">가운데 카드 더미 <b id="doble-left">18</b>장</div>' +
      '    <div class="doble-pilebox">' +
      '      <span class="doble-stack s3"></span>' +
      '      <span class="doble-stack s2"></span>' +
      '      <span class="doble-stack s1"></span>' +
      '      <div class="doble-card big" id="doble-pile"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="doble-col">' +
      '    <div class="doble-lb">AI 카드</div>' +
      '    <div class="doble-card small" id="doble-ai"></div>' +
      '  </div>' +
      '</div>' +
      '<p class="doble-tip">내 카드와 가운데 카드에 <b>똑같이 있는 낱말</b>을 찾아 치세요' +
      '<span class="doble-wrong" id="doble-wrong"></span>' +
      (DECK_OK ? '' : ' · (카드 검산 실패)') + '</p>';
    A.stage().appendChild(table);

    /* ---------- 규칙 1 — 카드를 나눈다 ---------- */
    var cards = DATA.shuffle(DECK.slice()).slice(0, TOTAL);   // 21장 중 20장
    C = {
      words: pickWords(curStage),
      my: cards[0], ai: cards[1], pile: cards.slice(2),       // 나 1 · AI 1 · 더미 18
      myId: 0, aiId: 1, pileId: 2,
      myN: 1, aiN: 1, total: cards.length,
      round: 0, rounds: cards.length - 2,
      timeLeft: LIMIT, errBase: 0, phase: 'wait', answer: -1,
      myAns: null
    };
    G.doble = C;
    G.items = [];

    renderCard('doble-my', C.my, C.myId);
    renderCard('doble-ai', C.ai, C.aiId);
    showCount();
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
    b.style.width = (left / LIMIT * 100) + '%';
    if (box) box.classList.toggle('hot', left <= LIMIT * 0.32);
  }

  /* =========================================================
     한 판 — 규칙 2: 더미 맨 위 카드는 내 카드와 공통 낱말이 하나
     ========================================================= */
  function nextRound() {
    if (!C) return;
    if (!C.pile.length) { finish(); return; }

    var top = C.pile[0];
    C.pileId = C.total - C.pile.length + 2;
    renderCard('doble-pile', top, C.pileId);
    var pileBox = A.el('doble-pile');
    pileBox.classList.remove('to-me', 'to-ai');
    void pileBox.offsetWidth;
    pileBox.classList.add('in');

    C.answer = common(C.my, top);
    C.myAns = wordEl('doble-my', C.answer);

    var wEl = wordEl('doble-pile', C.answer);
    var item = {
      word: C.words[C.answer], el: pileBox, wEl: wEl,
      lock: false, matched: 0, dead: false
    };
    G.items = [item];                 // 정답 낱말 하나만 — 다른 걸 치면 엔진이 오타로 잡는다

    C.timeLeft = LIMIT;
    C.errBase = G.errors;
    C.wrongShown = -1;
    C.phase = 'play';
    showTime();
    showCount();
    A.progress(C.round / C.rounds);
    draw();
  }

  /* =========================================================
     매 프레임 — 규칙 3: 25초 카운트다운
     ========================================================= */
  function step(dt) {
    if (!C || C.phase !== 'play') return;
    C.timeLeft -= dt;
    showTime();
    // "잘못 치면" — 다른 낱말을 여러 번 치면 그 카드는 AI 것
    var wrong = G.errors - C.errBase;
    if (wrong !== C.wrongShown) {
      C.wrongShown = wrong;
      var we = A.el('doble-wrong');
      if (we) we.textContent = wrong > 0 ? ' · 잘못 친 횟수 ' + wrong + ' / ' + WRONG_MAX : '';
    }
    if (wrong >= WRONG_MAX) { loseCard('잘못 쳤어요'); return; }
    if (C.timeLeft <= 0) { loseCard('시간이 다 됐어요'); }
  }

  /* ---------- 성공 — 규칙 3: 내 카드 수가 늘어난다 ---------- */
  function hit(item) {
    if (!C || C.phase !== 'play') return;
    item.dead = true;
    G.items = [];
    C.phase = 'anim';

    A.addScore(item.word);
    C.myN++;
    C.round++;

    var got = C.pile.shift();
    var pileBox = A.el('doble-pile');
    pileBox.classList.remove('in');
    pileBox.classList.add('to-me');
    if (C.myAns) C.myAns.classList.add('found');

    A.flashItem({ icon: '🃏', name: '"' + item.word + '" 정답! 카드를 가져왔어요', color: '#7ee7c4' });

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
    C.timeLeft = 0;
    showTime();

    var got = C.pile.shift();
    var pileBox = A.el('doble-pile');
    pileBox.classList.remove('in');
    pileBox.classList.add('to-ai');
    // 못 찾은 낱말을 알려 준다
    var ans = wordEl('doble-pile', C.answer);
    if (ans) ans.classList.add('miss');
    if (C.myAns) C.myAns.classList.add('miss');

    A.flashItem({
      icon: '🤖', name: why + ' — "' + C.words[C.answer] + '" · AI가 카드를 가져갔어요',
      color: '#ff6b81'
    });

    setTimeout(function () {
      if (!C || !G || G.over) return;
      C.ai = got;                       // AI가 가져간 카드가 AI의 새 카드가 된다
      C.aiId = C.pileId;
      renderCard('doble-ai', C.ai, C.aiId);
      nextRound();
    }, 900);
  }

  /* =========================================================
     규칙 4 — 20장을 다 가져간 뒤 더 많이 가진 쪽이 승리
     ========================================================= */
  function finish() {
    C.phase = 'end';
    A.progress(1);
    var win = C.myN > C.aiN;
    var msg = win
      ? '🏆 나 ' + C.myN + '장 · AI ' + C.aiN + '장 — 승리!'
      : (C.myN === C.aiN
        ? '🤝 나 ' + C.myN + '장 · AI ' + C.aiN + '장 — 비겼어요'
        : '🤖 나 ' + C.myN + '장 · AI ' + C.aiN + '장 — 아쉬워요');
    var me = C.myN, ai = C.aiN;
    A.gameOver(msg, win);
    endScreen(win, me, ai);
  }

  /** 기획서 3쪽 그림 — 축하합니다!!! / 승리하셨습니다~ / 다시하기 · 다음단계 */
  function endScreen(win, me, ai) {
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
      (win
        ? '<h2>축하합니다!!!</h2><p>승리하셨습니다~</p>'
        : (me === ai
          ? '<h2>비겼습니다</h2><p>한 장 차이로 갈려요, 다시 해 볼까요?</p>'
          : '<h2>아쉬워요</h2><p>AI가 카드를 더 많이 가져갔어요</p>')) +
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
})();
