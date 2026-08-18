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

   기획서에 없는 것 (선생님 요청으로 넣었다)
     - 3단계: 16칸 중 폭탄 5개, 10개를 치면 성공. 낱말은 무작위
     - 폭탄을 쳐도 바로 안 터진다. 심지가 타는 동안 그 낱말을 한 번 더 치면 꺼진다
       심지 시간은 낱말 길이에 맞춘다 (아래 fuseOf 주석)
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
    { no: 2, size: 4, bombs: 3, goal: 12, words: STAGE2_WORDS },  // 규칙 2·4·7
    /* 3단계는 기획서에 없다. 16칸 중 폭탄 5개 → 안전한 칸이 11개뿐이라
       1·2단계와 같은 결(안전한 칸에서 하나만 남기고 다 치기)로 10개를 목표로 잡았다.
       낱말은 기획서에 없으니 전체에서 무작위로 뽑는다.
       단계가 하나 늘어난 만큼 제한시간을 90초 더 준다 (bonus). */
    { no: 3, size: 4, bombs: 5, goal: 10, words: null, bonus: 90 }
  ];

  /* 심지가 타는 시간 (초).
     예전에는 낱말 길이와 상관없이 2.5초였다. 그런데 심지를 끄려면 그 낱말을 통째로
     다시 쳐야 한다. '어머니'는 6타 — 한 글자에 2.5초 걸리는 아이라면 15초가 필요하다.
     즉 이 게임에서 제일 좋은 장치가 대상 아이에게는 한 번도 성공하지 않았다.
     그래서 낱말 타수에 비례하게 바꿨다. 빠른 아이에게는 여전히 빠듯하다. */
  var FUSE_BASE = 2.5;
  var FUSE_PER_KEY = 0.6;
  function fuseOf(word) { return FUSE_BASE + FUSE_PER_KEY * A.keyLen(word); }

  /* 단계를 깰 때 남은 시간 1초당 주는 점수 — 빨리 치면 이득이 있어야 한다 */
  var TIME_BONUS = 3;

  var firstPlay = true;   // 첫 판은 기획서 낱말 그대로, 다시 하면 무작위
  var fitTimer = null;    // 게임판 높이가 바뀌면(자판 안내 on/off) 격자를 다시 맞춘다

  /* =========================================================
     그림 — 이 게임의 주인공(폭탄·심지·물방울·폭발)을 직접 그린다.
     예전에는 OS 이모지(💣 🧨 💥 💧)를 썼는데, 크롬북에서 컬러 이모지는 광택 3D로
     그려져 다른 게임의 평면 벡터 그림과 재질이 아예 달랐다.
     규칙: 외곽선 #2b241d, 두께 2.4 (viewBox 100 의 2.4%), 둥근 모서리, 단색 평면.
     ========================================================= */
  function wrapSvg(cls, inner) {
    return '<svg class="bsvg ' + cls + '" viewBox="0 0 100 100" aria-hidden="true">' + inner + '</svg>';
  }

  /* 폭탄 몸통 — 둥근 쇠공 + 목 + 하이라이트 한 줄 */
  var BOMB_BODY =
    '<path class="bd" d="M45 32 C25 32 12 48 12 65 C12 81 27 93 45 93 C63 93 78 81 78 65 C78 48 65 32 45 32 Z"/>' +
    '<path class="cap" d="M36 21 h18 a5 5 0 0 1 5 5 v9 h-28 v-9 a5 5 0 0 1 5 -5 z"/>' +
    '<path class="shine" d="M26 57 C28 48 34 42 42 40"/>';

  /* 아직 불이 안 붙은 폭탄 (드러난 폭탄 · 표시줄 · 인트로) */
  var SVG_BOMB = wrapSvg('bomb', BOMB_BODY +
    '<path class="cord" d="M57 24 C68 21 75 17 78 11"/>' +
    '<path class="spark" d="M80 1 C82 9 86 13 94 15 C86 17 82 21 80 29 C78 21 74 17 66 15 C74 13 78 9 80 1 Z"/>');

  /* 심지에 불이 붙은 폭탄 — 불꽃이 크게 인다 */
  var SVG_LIT = wrapSvg('lit', BOMB_BODY +
    '<path class="cord" d="M57 26 C66 28 72 30 76 32"/>' +
    '<path class="fl1" d="M78 33 C65 27 67 11 78 3 C76 12 86 12 86 19 C91 16 91 9 89 5 C97 12 97 29 78 33 Z"/>' +
    '<path class="fl2" d="M78 29 C72 25 73 16 78 12 C78 18 82 18 82 22 C82 26 80 28 78 29 Z"/>');

  /* 물방울 — 심지를 껐다는 표시 */
  var SVG_DROP = wrapSvg('drop',
    '<path class="dp" d="M50 6 C50 6 80 44 80 63 C80 81 67 93 50 93 C33 93 20 81 20 63 C20 44 50 6 50 6 Z"/>' +
    '<path class="dsh" d="M34 67 C33 56 38 46 46 41"/>');

  /* 폭발 — 두 겹 별 */
  var SVG_BOOM = wrapSvg('boom',
    '<path class="b1" d="M50 2 L60 25 L82 12 L74 36 L98 44 L76 55 L88 78 L62 71 L52 96 L40 71 L16 82 L23 56 L2 45 L25 35 L13 12 L37 24 Z"/>' +
    '<path class="b2" d="M50 26 L57 40 L70 33 L65 47 L79 51 L64 58 L70 71 L56 65 L50 79 L44 65 L31 70 L36 57 L23 51 L37 45 L32 32 L44 39 Z"/>');

  /* 시계 — 남은 시간 보너스 알림에 쓴다 */
  var SVG_CLOCK = wrapSvg('clock',
    '<circle class="cf" cx="50" cy="55" r="38"/>' +
    '<path class="ch" d="M50 32 L50 55 L67 65"/>' +
    '<path class="ct" d="M38 10 h24"/>');

  /* 둘레 숫자를 설명할 때 쓰는 그림 — 가운데 칸과 둘레 여덟 칸 */
  var SVG_NUM = wrapSvg('num',
    '<rect class="g" x="8" y="8" width="84" height="84" rx="4"/>' +
    '<path class="g2" d="M36 8 V92 M64 8 V92 M8 36 H92 M8 64 H92"/>' +
    '<circle class="dot" cx="22" cy="22" r="7"/>' +
    '<circle class="dot" cx="78" cy="78" r="7"/>');

  /* 기획서 3쪽 왼쪽 시작 화면 — 제목과 놀이 버튼 */
  var INTRO =
    '<div class="bomb-intro">' +
    '  <div class="bomb-intro-paper">' +
    '    <h2 class="bomb-title"><i>폭</i><i>탄</i><b>피하기</b></h2>' +
    '    <button type="button" class="bomb-play">놀이</button>' +
    '    <div class="bomb-introart">' +
    '      <span class="bi"><i>' + SVG_BOMB + '</i><b>숨은 폭탄</b></span>' +
    '      <span class="bi"><i>' + SVG_LIT + '</i><b>심지에 불</b></span>' +
    '      <span class="bi"><i>' + SVG_DROP + '</i><b>한 번 더 치면 꺼짐</b></span>' +
    '      <span class="bi"><i>' + SVG_BOOM + '</i><b>늦으면 폭발</b></span>' +
    '    </div>' +
    '    <p class="bomb-intro-by">학생이 만든 게임 · 기획 남자팀</p>' +
    '    <p class="bomb-intro-desc">낱말 9개 가운데 1개가 폭탄이에요. 어디 있는지는 안 보입니다.<br>' +
    '      폭탄을 피해 7개를 치면 1단계 통과. 2단계는 16개 중 3개, 3단계는 16개 중 5개가 폭탄!<br>' +
    '      <b>폭탄을 쳐도 바로 안 터져요.</b> 심지가 타는 동안 그 낱말을 한 번 더 치면 꺼집니다.<br>' +
    '      친 칸에 남는 숫자는 <b>둘레에 숨은 폭탄 수</b>예요. 이걸 보고 안전한 칸을 고르세요.</p>' +
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
    '    <span class="v"><span class="hico">' + SVG_BOMB + '</span><i id="bomb-mines">1</i></span></div>' +
    '</div>' +
    '<div class="bomb-boardbox" id="bomb-boardbox">' +
    '  <div class="bomb-boardin">' +
    '    <div class="bomb-board" id="bomb-board"></div>' +
    '    <div class="bomb-corner" id="bomb-corner"></div>' +
    '  </div>' +
    '</div>' +
    '<p class="bomb-tip" id="bomb-tip"><span class="ti">' + SVG_NUM + '</span>' +
    '<span class="tt">친 칸에 남는 <b>숫자</b>는 그 칸을 <b>둘러싼 8칸에 숨은 폭탄 수</b>예요' +
    ' — 0이면 둘레가 모두 안전!</span></p>';

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
    G.bonusAll = 0;
    G.useDesign = firstPlay;   // 첫 판은 두 단계 모두 기획서 낱말 그대로

    var wrap = document.createElement('div');
    wrap.className = 'bomb-wrap';
    wrap.innerHTML = SHELL;
    A.stage().appendChild(wrap);

    G.wrap = wrap;
    G.board = A.el('bomb-board');
    G.boxEl = A.el('bomb-boardbox');
    G.cornerEl = A.el('bomb-corner');

    buildStage(1);
    showTime(G, true);
    firstPlay = false;

    /* 격자 크기를 게임판 높이에 맞춘다.
       머리말의 "⌨️ 자판" 을 켜면 화면 아래에 자판 한 줄이 생기면서 게임판이 낮아진다.
       예전처럼 vh 로만 크기를 잡으면 그때 격자 아랫줄이 잘려 나갔다.
       자판을 켜고 끄는 것은 이 파일 밖(games.js)에서 일어나므로, 판 크기를 지켜본다. */
    fit();
    if (fitTimer) clearInterval(fitTimer);
    fitTimer = setInterval(fit, 200);
    window.addEventListener('resize', fit);
  }

  /** 게임판(#stage) 안에 들어가는 가장 큰 정사각형으로 격자를 맞춘다 */
  function fit() {
    var G = A.state();
    if (!G || G.id !== 'bomb' || !G.boxEl || !G.boxEl.isConnected) {
      if (fitTimer) { clearInterval(fitTimer); fitTimer = null; }
      window.removeEventListener('resize', fit);
      return;
    }
    var h = G.boxEl.clientHeight, w = G.boxEl.clientWidth;
    if (!h || !w) return;
    // 오른쪽 위로 튀어나오는 "모서리 낱말" 자리를 남겨 두려고 폭은 넉넉히 나눈다
    var side = Math.floor(Math.min(h - 2, w * 0.56));
    if (side < 150) side = 150;
    if (side === G.bsz) return;
    G.bsz = side;
    G.wrap.style.setProperty('--bsz', side + 'px');
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
    // 낱말이 모자라면 (그럴 일은 거의 없다) 기획서 낱말이나 앞의 것으로 채운다
    while (out.length < need) {
      out.push((stage.words && stage.words[out.length]) || out[0] || '나라');
    }
    return out;
  }

  function buildStage(no) {
    var G = A.state();
    var s = STAGES[no - 1];
    G.stage = s;
    G.hits = 0;
    G.defused = 0;
    G.items = [];
    G.cells = [];
    // 최고 기록을 단계별로 나눈다 (1·2·3단계는 판이 아예 다른 게임이다)
    A.recKey(s.no + '단계');

    // 3단계는 기획서에 낱말이 없어서 늘 무작위다
    var words = (G.useDesign && s.words) ? s.words.slice() : randomWords(s);
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
    G.wrap.style.setProperty('--n', String(s.size));

    for (var i = 0; i < n; i++) {
      var w = words[i];
      var cell = document.createElement('div');
      cell.className = 'bomb-cell';
      cell.innerHTML =
        '<span class="bw n' + Math.min(6, w.length) + '"></span>' +
        '<span class="bnum"></span>' +
        '<span class="bart mine"></span>' +   // 드러난 폭탄
        '<span class="bart flame"></span>' +  // 타는 심지 (모서리 배지)
        '<span class="bart drop"></span>' +   // 꺼진 폭탄
        '<span class="bfuse"><i></i></span>';
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
    fit();
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
    // 아직 안 꺼진 폭탄 수
    A.el('bomb-mines').textContent = G.stage.bombs - (G.defused || 0);
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

    // 심지가 타는 폭탄 — 그 안에 낱말을 한 번 더 치면 꺼진다
    for (var i = G.items.length - 1; i >= 0; i--) {
      var it = G.items[i];
      if (!it.fusing) continue;
      it.fuse -= dt;
      var bar = it.el.querySelector('.bfuse i');
      if (bar) bar.style.width = Math.max(0, it.fuse / it.fuseMax) * 100 + '%';
      // 남은 심지가 3할 밑으로 내려가면 칸이 더 빨갛게 탄다
      it.el.classList.toggle('hot', it.fuse < it.fuseMax * 0.3);
      // 똑딱 소리로 남은 시간을 알린다 (0.5초마다)
      it.tick = (it.tick || 0) + dt;
      if (it.tick >= 0.5) { it.tick = 0; A.sfx('tick'); }
      if (it.fuse <= 0) { boom(it); return; }
    }

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
      goStage(item.next || 2);
      return;
    }

    // 심지가 타는 중인 폭탄을 한 번 더 쳤다 — 꺼진다
    if (item.fusing) { defuse(item); return; }
    // 폭탄을 처음 쳤다 — 바로 안 터지고 심지에 불이 붙는다
    if (item.bomb) { lightFuse(item); return; }

    item.dead = true;
    G.items = G.items.filter(function (it) { return it !== item; });

    A.addScore(item.word);
    G.hits++;

    var cnt = around(item.idx);
    var cell = item.el;
    cell.classList.remove('lock');
    cell.classList.add('open', 'c' + cnt);
    cell.querySelector('.bnum').textContent = cnt;
    item.wEl.innerHTML = '';

    // 이 게임의 유일한 실력 요소 — 숫자가 처음 나올 때 한 번 짚어 준다
    if (!G.taughtNum) {
      G.taughtNum = true;
      cell.classList.add('teach');
      var tip = A.el('bomb-tip');
      if (tip) {
        tip.classList.add('hi');
        setTimeout(function () { tip.classList.remove('hi'); }, 4200);
      }
      setTimeout(function () { cell.classList.remove('teach'); }, 4200);
      A.flashItem({
        icon: SVG_NUM,
        name: '이 숫자 = 둘레 8칸에 숨은 폭탄 수!',
        color: '#3ec8a0'
      });
    }

    updateHud();
    if (G.hits >= G.stage.goal) stageClear();
    else draw();
  }

  /* ---------- 심지 (기획서에 없다, 선생님 요청) ----------
     폭탄을 치면 바로 터지지 않고 심지에 불이 붙는다. 그 안에 그 낱말을 한 번 더 치면
     꺼진다. 낱말은 계속 보여야 다시 칠 수 있으니 지우지 않는다. */
  function lightFuse(item) {
    item.fusing = true;
    item.fuseMax = fuseOf(item.word);
    item.fuse = item.fuseMax;
    item.tick = 0;
    item.lock = false;
    item.matched = 0;
    A.breakCombo();
    A.sfx('bad');
    item.el.classList.add('fusing');
    var fl = item.el.querySelector('.bart.flame');
    if (fl && !fl.innerHTML) fl.innerHTML = SVG_LIT;
    var bar = item.el.querySelector('.bfuse i');
    if (bar) bar.style.width = '100%';
    A.flashItem({
      icon: SVG_LIT,
      name: '폭탄! ' + Math.round(item.fuseMax) + '초 안에 한 번 더 치면 꺼져요',
      color: '#ff8fab'
    });
    draw();
  }

  /** 심지를 껐다 — 그 칸은 잠기고 더는 칠 수 없다.
      이 게임에서 제일 짜릿한 순간이라 큰 보상 연출을 건다. */
  function defuse(item) {
    var G = A.state();
    item.fusing = false;
    item.defused = true;
    item.dead = true;
    G.items = G.items.filter(function (it) { return it !== item; });
    G.defused++;

    item.el.classList.remove('fusing', 'hot', 'lock');
    item.el.classList.add('defused');
    item.wEl.innerHTML = '';
    var dp = item.el.querySelector('.bart.drop');
    if (dp && !dp.innerHTML) dp.innerHTML = SVG_DROP;

    // 두 번이나 친 낱말이니 점수는 준다. 다만 폭탄이라 목표 개수에는 안 넣는다
    A.addScore(item.word);
    updateHud();
    cheerSvg(SVG_DROP, {
      name: '폭탄을 껐다!',
      sub: '남은 심지 ' + item.fuse.toFixed(1) + '초 — 폭탄 하나를 살려냈어요',
      color: '#5ad4e6'
    });
    draw();
  }

  /** A.cheer 는 아이콘을 글자로만 받는다. 띄운 다음 우리 그림으로 바꿔 끼운다 */
  function cheerSvg(svg, info) {
    info.icon = '●';
    A.cheer(info);
    var ic = A.stage().querySelector('.gcheer .ic');
    if (ic) ic.innerHTML = svg;
  }

  /** 타던 심지를 모두 멈춘다 (단계를 넘어가거나 게임이 끝날 때) */
  function clearFuses() {
    var G = A.state();
    if (!G || !G.cells) return;
    G.cells.forEach(function (it) {
      if (!it.fusing) return;
      it.fusing = false;
      it.el.classList.remove('fusing', 'hot');
    });
  }

  /* 폭탄이 터진다 — 안 보이던 폭탄이 드러나며 터진다 */
  function boom(item) {
    var G = A.state();
    G.blast = true;
    G.items = [];
    A.breakCombo();
    A.sfx('bad');
    clearFuses();

    item.el.classList.add('boom');
    item.el.querySelector('.bw').innerHTML = '';
    G.board.classList.add('shake');
    revealBombs();

    var flash = document.createElement('div');
    flash.className = 'bomb-flash';
    flash.innerHTML = SVG_BOOM;
    G.board.appendChild(flash);

    A.flashItem({ icon: SVG_BOOM, name: '폭탄이었어요!', color: '#ff8fab' });

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
      if (it.bomb && !it.defused) {
        var m = it.el.querySelector('.bart.mine');
        if (m && !m.innerHTML) m.innerHTML = SVG_BOMB;
        it.el.classList.add('shown');
      }
    });
  }

  /* 단계 통과 — 모서리에 낱말이 나타난다 (규칙 6) */
  function stageClear() {
    var G = A.state();
    clearFuses();
    revealBombs();

    /* 남은 시간 보너스 — 예전에는 270초 중 1분이면 끝나도 남은 시간이 점수가 안 됐다.
       빨리 치면 이득이 있어야 한다. */
    var sec = Math.max(0, Math.floor(G.left));
    var bonus = sec * TIME_BONUS;
    G.bonusAll = (G.bonusAll || 0) + bonus;
    if (bonus > 0) A.bump(bonus);

    if (G.stage.no >= STAGES.length) {
      A.gameOver('🎉 폭탄을 다 피했어요! ' + STAGES.length + '단계까지 성공 · 시간 보너스 +' +
        G.bonusAll + '점', true);
      return;
    }

    var next = G.stage.no + 1;
    G.items = [];
    G.board.classList.add('done');

    var pool = DATA.WORD_UPTO[1] || DATA.WORDS;
    var w = pool[Math.floor(Math.random() * pool.length)];

    var el = G.cornerEl;
    el.className = 'bomb-corner on';
    el.innerHTML =
      '<span class="clab">' + G.stage.no + '단계 통과! 이 낱말을 쓰면 ' + next + '단계</span>' +
      '<span class="cw"></span>' +
      '<span class="cbonus">남은 시간 ' + sec + '초 × ' + TIME_BONUS + ' = <b>+' + bonus + '점</b></span>';
    G.items.push({
      word: w, el: el, wEl: el.querySelector('.cw'),
      corner: true, next: next, lock: false, matched: 0, dead: false
    });

    A.flashItem({
      icon: SVG_CLOCK,
      name: '남은 시간 보너스 +' + bonus + '점',
      color: '#ffcc5c'
    });
    draw();
  }

  function goStage(no) {
    var G = A.state();
    var s = STAGES[no - 1];
    G.cornerEl.className = 'bomb-corner';
    G.cornerEl.innerHTML = '';
    G.board.classList.remove('done');
    buildStage(no);
    // 단계가 늘어난 만큼 시간을 더 준다 (3단계)
    if (s.bonus) {
      G.left += s.bonus;
      showTime(G, true);
    }
    A.flashItem({
      icon: SVG_BOMB,
      name: no + '단계 — 폭탄이 ' + s.bombs + '개!' + (s.bonus ? ' (+' + s.bonus + '초)' : ''),
      color: '#ffcc5c'
    });
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
    nudgeIfWrong(G);
  }

  /* 틀리게 쳤을 때 몸으로 오는 것 — 격자가 한 번 짧게 흔들린다.
     (폭발의 shake 보다 약하다) games.js 는 틀린 입력에도 draw() 를 부르므로
     "친 글자가 있는데 어느 낱말과도 안 맞는" 상태를 여기서 알아본다. */
  function nudgeIfWrong(G) {
    if (G.over || G.blast || !G.items.length) return;
    var input = A.el('gamein');
    var v = input ? input.value : '';
    var any = false;
    G.items.forEach(function (it) { if (it.lock) any = true; });
    if (v && !any) {
      if (G.wrongOn) return;
      G.wrongOn = true;
      var b = G.board;
      b.classList.remove('nudge');
      void b.offsetWidth;          // 애니메이션을 다시 태운다
      b.classList.add('nudge');
      setTimeout(function () { b.classList.remove('nudge'); }, 320);
    } else {
      G.wrongOn = false;
    }
  }

  GAMES.register('bomb', {
    name: '폭탄 피하기', credit: '남자팀', icon: '💣',
    desc: '낱말 9개 중 하나가 폭탄이에요. 어디 있는지는 안 보입니다. 폭탄을 쳐도 심지가 타는 동안 한 번 더 치면 꺼져요!',
    pdf: 'game_vibe/20260818105008.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
