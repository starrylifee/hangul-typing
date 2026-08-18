/* g-bomb.js — 폭탄 피하기 (기획 · 남자팀)
   game_vibe/20260818105008.pdf 의 규칙과 그림을 그대로 옮겼다.

   기획서 규칙
     1) 9개의 낱말 중 1개가 폭탄. 폭탄을 피하며 낱말을 쓴다 (놀이를 누르면 시작)
     2) 1단계는 맛보기, 2단계는 16개의 낱말 중 3개가 폭탄
     3) 폭탄은 랜덤으로 놓고, 어디 있는지 보이면 안 된다
     4) 제한시간 동안 최소 7개는 써야 한다 (2단계는 최소 12개)
     5) 제한시간은 3분
     6) 1단계를 통과하면 모서리에 낱말이 나타나고, 그걸 쓰면 2단계로 넘어감
     7) 1단계 7개 성공 / 2단계 12개 성공. 못 넘기면 실패
     8) 1단계는 기본자리, 2단계는 어려운 낱말 무작위
*/
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 ---------- */
  var TIME_LIMIT = 180;          // 규칙 5: 제한시간 3분

  /* 기획서 3쪽 1단계 3×3 격자 — 학생이 적은 낱말 그대로 */
  var STAGE1_WORDS = [
    '어머니', '마미', '머니',
    '랜닝', '알리', '마인',
    '나이', '나는', '니아'
  ];
  /* 기획서 4쪽 2단계 4×4 격자 — 학생이 적은 낱말 그대로.
     판독이 안 되던 네 칸만 바꿨다 (옴라대왕→염라대왕, 왕되→왕관, 끈욱→끈기, 독손→독감).
     나머지 열두 칸은 학생 글씨 그대로다. */
  var STAGE2_WORDS = [
    '나트륨', '소듐', '상추쌈', '염라대왕',
    '왕관', '사냥꾼', '끈기', '값어치',
    '라면', '치어', '끝내', '신용',
    '수산화나트륨', '고양이', '오븐', '독감'
  ];

  var STAGES = [
    { no: 1, size: 3, bombs: 1, goal: 7, words: STAGE1_WORDS },   // 규칙 1·4·7
    { no: 2, size: 4, bombs: 3, goal: 12, words: STAGE2_WORDS }   // 규칙 2·4·7
  ];

  var firstPlay = true;   // 첫 판은 기획서 낱말 그대로, 다시 하면 무작위

  /* 기획서 3쪽 왼쪽 "시작 (킹받으면 넘길 것)" 화면 — 제목과 놀이 버튼 */
  var INTRO =
    '<div class="bomb-intro">' +
    '  <div class="bomb-intro-paper">' +
    '    <p class="bomb-intro-top">시작 <span>(킹받으면 넘길 것)</span></p>' +
    '    <h2 class="bomb-title"><i>폭</i><i>탄</i><b>피하기</b></h2>' +
    '    <button type="button" class="bomb-play">놀이</button>' +
    '    <p class="bomb-intro-by">학생이 만든 게임 · 기획 남자팀</p>' +
    '    <p class="bomb-intro-desc">낱말 9개 가운데 1개가 폭탄이에요. 어디 있는지는 안 보입니다.<br>' +
    '      폭탄을 피해 7개를 치면 1단계 통과, 2단계는 16개 중 3개가 폭탄이에요.</p>' +
    '    <p class="bomb-intro-go">놀이를 누르거나 엔터를 치면 시작해요</p>' +
    '  </div>' +
    '</div>';

  var SHELL =
    '<div class="bomb-hud">' +
    '  <div class="bomb-h step"><span class="k">단계</span><span class="v" id="bomb-step">1단계</span></div>' +
    '  <div class="bomb-h time"><span class="k">남은 시간</span><span class="v" id="bomb-time">3:00</span></div>' +
    '  <div class="bomb-h goal"><span class="k">친 낱말</span>' +
    '    <span class="v"><i id="bomb-hit">0</i> / <i id="bomb-goal">7</i></span></div>' +
    '  <div class="bomb-h mine"><span class="k">숨은 폭탄</span>' +
    '    <span class="v">💣 <i id="bomb-mines">1</i></span></div>' +
    '</div>' +
    '<div class="bomb-boardbox">' +
    '  <div class="bomb-boardin">' +
    '    <div class="bomb-board" id="bomb-board"></div>' +
    '    <div class="bomb-corner" id="bomb-corner"></div>' +
    '  </div>' +
    '</div>' +
    '<p class="bomb-tip">친 칸에 나오는 숫자는 <b>그 칸을 둘러싼 칸에 숨은 폭탄 수</b>예요.</p>';

  /* =========================================================
     시작
     ========================================================= */
  function start() {
    A.prepare('bomb', INTRO);
    var G = A.state();
    G.left = TIME_LIMIT;
    G.hits = 0;
    G.blast = false;
    G.timeTxt = '';
    G.useDesign = firstPlay;   // 첫 판은 두 단계 모두 기획서 낱말 그대로

    var wrap = document.createElement('div');
    wrap.className = 'bomb-wrap';
    wrap.innerHTML = SHELL;
    A.stage().appendChild(wrap);

    G.wrap = wrap;
    G.board = A.el('bomb-board');
    G.cornerEl = A.el('bomb-corner');

    buildStage(1);
    showTime(G, true);
    firstPlay = false;
  }

  /* =========================================================
     격자 만들기
     ========================================================= */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 다시 할 때 쓸 낱말 — 1단계는 기본자리(1단계 낱말), 2단계는 전체에서 무작위 (규칙 8) */
  function randomWords(stage) {
    var pool = stage.no === 1
      ? (DATA.WORD_UPTO[1] || DATA.WORDS)
      : DATA.WORDS;
    var need = stage.size * stage.size;
    var p = shuffle(pool.slice());
    var out = [], seen = {};
    for (var i = 0; i < p.length && out.length < need; i++) {
      if (seen[p[i]]) continue;
      seen[p[i]] = 1;
      out.push(p[i]);
    }
    while (out.length < need) out.push(stage.words[out.length]);
    return out;
  }

  function buildStage(no) {
    var G = A.state();
    var s = STAGES[no - 1];
    G.stage = s;
    G.hits = 0;
    G.items = [];
    G.cells = [];

    var words = G.useDesign ? s.words.slice() : randomWords(s);
    var n = s.size * s.size;

    // 규칙 3: 폭탄은 무작위로 놓고 어디 있는지 보이지 않는다
    var order = shuffle(function () {
      var a = []; for (var i = 0; i < n; i++) a.push(i); return a;
    }());
    var isBomb = [];
    for (var b = 0; b < n; b++) isBomb[b] = false;
    for (var k = 0; k < s.bombs; k++) isBomb[order[k]] = true;

    var board = G.board;
    board.innerHTML = '';
    board.className = 'bomb-board';
    board.style.setProperty('--n', s.size);

    for (var i = 0; i < n; i++) {
      var w = words[i];
      var cell = document.createElement('div');
      cell.className = 'bomb-cell';
      cell.innerHTML =
        '<span class="bw n' + Math.min(6, w.length) + '"></span>' +
        '<span class="bnum"></span>' +
        '<span class="bmine">💣</span>';
      board.appendChild(cell);
      var it = {
        word: w, el: cell, wEl: cell.querySelector('.bw'),
        idx: i, bomb: isBomb[i], lock: false, matched: 0, dead: false
      };
      G.cells.push(it);
      G.items.push(it);
    }

    A.el('bomb-step').textContent = s.no + '단계';
    A.el('bomb-goal').textContent = s.goal;
    A.el('bomb-mines').textContent = s.bombs;
    updateHud();
    draw();
  }

  /** 둘레 여덟 칸에 숨은 폭탄 수 — 친 칸에 숫자로 남는다 */
  function around(idx) {
    var G = A.state(), sz = G.stage.size;
    var r = Math.floor(idx / sz), c = idx % sz, cnt = 0;
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= sz || cc >= sz) continue;
        if (G.cells[rr * sz + cc].bomb) cnt++;
      }
    }
    return cnt;
  }

  function updateHud() {
    var G = A.state();
    A.el('bomb-hit').textContent = G.hits;
    A.progress(G.hits / G.stage.goal);
  }

  function showTime(G, force) {
    var t = Math.max(0, Math.ceil(G.left));
    var txt = Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60);
    if (!force && txt === G.timeTxt) return;
    G.timeTxt = txt;
    var el = A.el('bomb-time');
    if (!el) return;
    el.textContent = txt;
    el.parentNode.classList.toggle('low', t <= 30);
  }

  /* =========================================================
     매 프레임 — 3분 카운트다운 (규칙 5)
     ========================================================= */
  function step(dt) {
    var G = A.state();
    if (!G || G.over || G.blast) return;
    if (dt > 0) G.left -= dt;
    if (G.left <= 0) {
      G.left = 0;
      showTime(G);
      revealBombs();
      A.gameOver('⏰ 3분이 다 됐어요 — 낱말 ' + G.hits + ' / ' + G.stage.goal + '개', false);
      return;
    }
    showTime(G);
  }

  /* =========================================================
     낱말을 다 쳤을 때
     ========================================================= */
  function hit(item) {
    var G = A.state();
    if (!G || G.blast) return;

    // 1단계를 통과하면 모서리에 나타나는 낱말 (규칙 6)
    if (item.corner) {
      item.dead = true;
      G.items = [];
      A.addScore(item.word);
      goStage2();
      return;
    }

    item.dead = true;
    G.items = G.items.filter(function (it) { return it !== item; });

    if (item.bomb) { boom(item); return; }

    A.addScore(item.word);
    G.hits++;

    var cell = item.el;
    cell.classList.remove('lock');
    cell.classList.add('open');
    cell.querySelector('.bnum').textContent = around(item.idx);
    item.wEl.innerHTML = '';

    updateHud();
    if (G.hits >= G.stage.goal) stageClear();
    else draw();
  }

  /* 폭탄이 터진다 — 안 보이던 폭탄이 드러나며 터진다 */
  function boom(item) {
    var G = A.state();
    G.blast = true;
    G.items = [];
    A.breakCombo();

    item.el.classList.add('boom');
    item.el.querySelector('.bw').innerHTML = '';
    G.board.classList.add('shake');
    revealBombs();

    var flash = document.createElement('div');
    flash.className = 'bomb-flash';
    flash.textContent = '💥';
    G.board.appendChild(flash);

    A.flashItem({ icon: '💥', name: '폭탄이었어요!', color: '#ff8fab' });

    setTimeout(function () {
      var g = A.state();
      if (!g || g.id !== 'bomb') return;
      A.gameOver('💥 폭탄을 밟았어요! 낱말 ' + g.hits + ' / ' + g.stage.goal + '개', false);
    }, 1150);
  }

  /** 숨어 있던 폭탄을 모두 드러낸다 */
  function revealBombs() {
    var G = A.state();
    if (!G || !G.cells) return;
    G.cells.forEach(function (it) {
      if (it.bomb) it.el.classList.add('shown');
    });
  }

  /* 1단계 통과 — 모서리에 낱말이 나타난다 (규칙 6) */
  function stageClear() {
    var G = A.state();
    if (G.stage.no === 2) {
      revealBombs();
      A.gameOver('🎉 폭탄을 다 피했어요! 2단계까지 성공', true);
      return;
    }

    revealBombs();
    G.items = [];
    G.board.classList.add('done');

    var pool = DATA.WORD_UPTO[1] || DATA.WORDS;
    var w = pool[Math.floor(Math.random() * pool.length)];

    var el = G.cornerEl;
    el.className = 'bomb-corner on';
    el.innerHTML =
      '<span class="clab">1단계 통과! 이 낱말을 쓰면 2단계</span>' +
      '<span class="cw"></span>';
    G.items.push({
      word: w, el: el, wEl: el.querySelector('.cw'),
      corner: true, lock: false, matched: 0, dead: false
    });

    A.flashItem({ icon: '🎉', name: '모서리 낱말이 나타났어요', color: '#6ee7a0' });
    draw();
  }

  function goStage2() {
    var G = A.state();
    G.cornerEl.className = 'bomb-corner';
    G.cornerEl.innerHTML = '';
    G.board.classList.remove('done');
    buildStage(2);
    A.flashItem({ icon: '💣', name: '2단계 — 폭탄이 3개!', color: '#ffcc5c' });
  }

  /* =========================================================
     그리기
     ========================================================= */
  function draw() {
    var G = A.state();
    if (!G || G.id !== 'bomb') return;
    G.items.forEach(function (it) {
      if (it.wEl) it.wEl.innerHTML = A.wordHtml(it);
      if (it.el) it.el.classList.toggle('lock', !!it.lock);
    });
  }

  GAMES.register('bomb', {
    name: '폭탄 피하기', credit: '남자팀', icon: '💣',
    desc: '낱말 9개 중 하나가 폭탄이에요. 어디 있는지는 안 보입니다. 폭탄을 피해서 7개를 치세요!',
    pdf: 'game_vibe/20260818105008.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
