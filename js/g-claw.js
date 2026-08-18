/* g-claw.js — 낱말 뽑기 (기획 · 삼색 볼펜)
   game_vibe/20260818104945.pdf 의 규칙과 그림을 그대로 옮겼다.

   규칙(원문) 1~9 를 그대로 옮긴 자리
     1. 제시문 낱말을 제한시간 안에 치면 인형이 뽑힌다        → hit()
     2. 못 치면 하트 3개 중 1개가 깨진다                      → miss()
     3. 한 단계당 3문제 × 7단계 = 21문제                      → PER_STAGE / STAGES
     4. 단계별 자리 = 이 앱의 1~7단계 (DATA.LEVELS)           → pickWord()
     5. 1·2·3단계 5초, 4·5·6단계 7초, 7단계 8초              → LIMIT
     6. 제시간에 못 쓰면 인형뽑기가 인형을 떨어뜨린다          → SEQ_MISS
     7. 낱말은 단계에 맞게 낸다                                → DATA.WORD_UPTO[n]
     8. 인형은 동물 인형·자연 인형                             → DOLL_SVG (7종)
     9. 하트 인형 — 제시간에 맞히면 목숨 +1(최대 3),
        놓치면 평소처럼 목숨 -1  (원문 글씨가 겹쳐 이렇게 정함)
     · 포인트는 10점씩                                        → POINT

   2026-08 고침 (기획서 수치는 하나도 안 건드렸다. 재는 방식만 바꿨다)
     · 제한시간을 "첫 글자를 친 순간" 부터 잰다. 낱말이 뜨고 자판을 찾는 동안은 시계가 안 간다.
       5·7·8초는 그대로다.
     · 하트 인형 확률을 목숨이 적을수록 올린다 (3개 0.18 · 2개 0.30 · 1개 0.45).
     · 10점은 그대로 두고 남은 시간 × 4 만큼 빠르기 보너스를 얹는다. 화면에 갈라 보여 준다.
     · 낱말을 기계 간판에 이 화면에서 제일 큰 글자로 띄우고, 남은 시간 막대를 그 바로 밑에 붙였다.
     · 크레인 연출 2.47초 → 1.36초.
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var STAGES = 7;
  var PER_STAGE = 3;
  var TOTAL = STAGES * PER_STAGE;              // 21문제
  var LIMIT = [0, 5, 5, 5, 7, 7, 7, 8];        // 규칙 5 — 단계별 제한시간(초)
  var POINT = 10;                              // 인형 하나 = 10점
  var LIVES = 3;                               // 하트 3개

  /* 규칙 9 "가끔" 하트 인형.
     0.18 로 고정해 뒀더니 잘하는 아이한테만 나왔다. 목숨이 적을수록 자주 나오게 —
     여섯 게임에 컴백 장치가 하나도 없었다. */
  var HEART_RATE = [0, 0.45, 0.30, 0.18];      // [ , 목숨1, 목숨2, 목숨3]
  /* 빠르기 보너스 = 남은 초 × 4.
     기획서의 "10점씩" 은 그대로 두고 그 위에 살짝 얹는 값이다.
     한 번 ×12 로 올렸다가 되돌렸다. 다른 게임(폭탄 2700 · 총 7500)과 자릿수를 맞추려던
     것인데 두 가지가 틀렸다. 하나, 그러면 5초 제한에 2초만 남겨도 보너스가 24점이라
     아이가 정한 인형 10점이 부수적인 것이 된다. 둘, 계수가 클수록 점수가 속도에 좌우돼
     느린 아이와 빠른 아이의 격차가 2.2배에서 4.6배로 벌어진다.
     "빨리 칠 이유가 없다" 는 원래 지적은 ×4 로도 이미 풀린다.
     게임마다 길이와 구조가 다르니 총점이 다른 것이 오히려 자연스럽다. */
  var SPEED_PT = 4;

  /* ---------- 화면 값 ---------- */
  var SLOTS = [13, 30.5, 48, 65.5, 83];        // 유리창 바닥의 인형 자리 5개 (그림 그대로)
  var FLOOR_B = 14;                            // 인형이 앉은 높이 — 유리창 바닥에서(%)
  var REST_DROP = 8;                           // 크레인 줄 기본 길이 (%)
  var GRAB_DROP = 57;                          // 인형을 잡으러 내려간 길이 (%)
  var CHUTE_X = 9;                             // 뽑은 인형을 떨어뜨리는 구멍 (유리창 왼쪽 아래)

  /* ---------- 인형 7종 — 기획서 4쪽(디자인 2) 그림 그대로 손그림처럼 ---------- */
  var DOLL_SVG = {
    cat:
      '<path d="M25 45 L29 17 L47 32"/>' +
      '<path d="M75 45 L71 17 L53 32"/>' +
      '<path d="M50 29 C31 29 19 43 19 58 C19 74 33 85 50 85 C67 85 81 74 81 58 C81 43 69 29 50 29 Z"/>' +
      '<path d="M42 34 L42 47 M50 31 L50 47 M58 34 L58 47"/>' +
      '<path d="M46 65 L50 69 L54 65 Z"/>' +
      '<path d="M50 69 C47 75 42 76 39 71 M50 69 C53 75 58 76 61 71"/>' +
      '<ellipse class="ey" cx="35" cy="58" rx="2.6" ry="4.2"/>' +
      '<ellipse class="ey" cx="65" cy="58" rx="2.6" ry="4.2"/>',
    dog:
      '<path d="M50 28 C32 28 21 42 21 57 C21 74 34 85 50 85 C66 85 79 74 79 57 C79 42 68 28 50 28 Z"/>' +
      '<path d="M24 40 C11 43 7 60 13 73 C17 82 27 80 27 70"/>' +
      '<path d="M76 40 C89 43 93 60 87 73 C83 82 73 80 73 70"/>' +
      '<path d="M44 66 C46 73 54 73 56 66 C53 63 47 63 44 66 Z"/>' +
      '<ellipse class="ey" cx="38" cy="55" rx="2.8" ry="4.4"/>' +
      '<ellipse class="ey" cx="62" cy="55" rx="2.8" ry="4.4"/>',
    rabbit:
      '<path d="M37 41 C30 25 30 10 38 8 C46 6 46 25 44 41"/>' +
      '<path d="M63 41 C70 25 70 10 62 8 C54 6 54 25 56 41"/>' +
      '<path d="M50 34 C33 34 23 46 23 60 C23 76 35 86 50 86 C65 86 77 76 77 60 C77 46 67 34 50 34 Z"/>' +
      '<path d="M46 68 L50 72 L54 68 Z"/>' +
      '<path d="M50 72 C47 78 42 79 39 74 M50 72 C53 78 58 79 61 74"/>' +
      '<ellipse class="ey" cx="39" cy="59" rx="2.6" ry="4.2"/>' +
      '<ellipse class="ey" cx="61" cy="59" rx="2.6" ry="4.2"/>',
    fish:
      '<path d="M16 52 C29 33 62 31 79 51 C62 71 29 71 16 52 Z"/>' +
      '<path d="M79 51 L94 37 L94 66 Z"/>' +
      '<path d="M53 40 L64 51 L53 62"/>' +
      '<path d="M56 46 L62 51 M55 55 L61 53"/>' +
      '<ellipse class="ey" cx="32" cy="50" rx="2.6" ry="4"/>',
    star:
      '<path d="M50 9 L61 39 L93 41 L68 60 L77 91 L50 73 L23 91 L32 60 L7 41 L39 39 Z"/>' +
      '<path d="M44 63 C47 68 53 68 56 63"/>' +
      '<ellipse class="ey" cx="42" cy="52" rx="2.7" ry="4.4"/>' +
      '<ellipse class="ey" cx="58" cy="52" rx="2.7" ry="4.4"/>',
    clover:
      '<g transform="translate(48,46)">' +
      '<path d="M0 0 C-7 -23 -33 -21 -29 -5 C-26 7 -10 10 0 0 Z"/>' +
      '<path d="M0 0 C-7 -23 -33 -21 -29 -5 C-26 7 -10 10 0 0 Z" transform="rotate(90)"/>' +
      '<path d="M0 0 C-7 -23 -33 -21 -29 -5 C-26 7 -10 10 0 0 Z" transform="rotate(180)"/>' +
      '<path d="M0 0 C-7 -23 -33 -21 -29 -5 C-26 7 -10 10 0 0 Z" transform="rotate(270)"/>' +
      '</g>' +
      '<path d="M54 56 C64 70 68 80 65 92"/>',
    heart:
      '<path d="M50 86 C18 66 12 41 27 30 C38 22 47 29 50 36 C53 29 62 22 73 30 C88 41 82 66 50 86 Z"/>' +
      '<path d="M44 60 C48 65 54 64 57 59"/>' +
      '<ellipse class="ey" cx="41" cy="47" rx="2.6" ry="4.4" transform="rotate(-12 41 47)"/>' +
      '<ellipse class="ey" cx="60" cy="50" rx="2.6" ry="4.4" transform="rotate(-12 60 50)"/>'
  };
  /* 인형 몸 색 — 색연필 느낌의 파스텔 단색(광택 그라데이션은 걷어냈다) */
  var DOLL_COLOR = {
    cat: '#ffdca4', dog: '#ffcdae', rabbit: '#ffd8ea', fish: '#b8e4f7',
    star: '#ffe488', clover: '#c8eeba', heart: '#ffc0cc'
  };
  var KINDS = ['cat', 'dog', 'rabbit', 'fish', 'star', 'clover'];   // 하트는 규칙 9 전용
  var KIND_NAME = {
    cat: '고양이', dog: '강아지', rabbit: '토끼', fish: '물고기',
    star: '별', clover: '클로버', heart: '하트'
  };

  /** 인형 그림 한 장. 6종+하트가 한 세트로 보이게 여기 한 곳에서만 만든다.
      외곽선 #2b241d · 두께는 viewBox 높이의 2.4% · 채움은 단색 평면.
      얼굴은 0.74 로 줄여 그리니 선 두께를 2.4/0.74=3.24 로 올려 놓았다 (CSS). */
  function dollSvg(kind) {
    return '<svg class="dsvg" viewBox="0 0 100 100" aria-hidden="true" ' +
      'style="--c1:' + DOLL_COLOR[kind] + '">' +
      '<circle class="bd" cx="50" cy="50" r="46.8"/>' +
      '<g class="fc" transform="translate(13,8) scale(.74)">' + DOLL_SVG[kind] + '</g>' +
      '</svg>';
  }

  /* 빨간 하트 3개 (기획서 오른쪽 위) */
  var HEART_HUD =
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<path class="hb" d="M50 86 C18 66 12 41 27 30 C38 22 47 29 50 36 C53 29 62 22 73 30 C88 41 82 66 50 86 Z"/>' +
    '<path class="crack" d="M50 30 L43 50 L57 58 L47 82"/>' +
    '</svg>';

  /* 집게 크레인 — 줄에 매달린 검은 모터 + 동그란 축 + 두 갈래 집게 (기획서 그림) */
  var HOOK_SVG =
    '<svg class="claw-hook" viewBox="0 0 60 76" aria-hidden="true">' +
    '<rect x="21" y="0" width="18" height="22" rx="4" fill="#23242a" stroke="#2b241d" stroke-width="2"/>' +
    '<rect x="25" y="4" width="4" height="14" rx="2" fill="#5b5f6b"/>' +
    '<circle cx="30" cy="29" r="8" fill="#f2f4f8" stroke="#2b241d" stroke-width="2.6"/>' +
    '<g class="arm l"><path d="M26 33 C15 44 10 57 12 72"/></g>' +
    '<g class="arm r"><path d="M34 33 C45 44 50 57 48 72"/></g>' +
    '</svg>';

  var G, C;

  /* ---------- 인트로 (엔터 → 3·2·1 → 시작) ---------- */
  function introHtml() {
    var chips = '';
    var all = KINDS.concat(['heart']);
    for (var i = 0; i < all.length; i++) chips += '<span class="claw-chip">' + dollSvg(all[i]) + '</span>';
    return '<div class="claw-introbg"></div>' +
      '<div class="gintro-box claw-introbox">' +
      '  <p class="gintro-by">학생이 만든 게임 · 기획 삼색 볼펜</p>' +
      '  <h2>낱말 뽑기</h2>' +
      '  <p class="gintro-desc">인형뽑기 기계예요. 유리창 안 인형에 적힌 낱말을<br>' +
      '     <b>제한시간 안에</b> 치면 집게가 인형을 뽑아 줍니다. 인형 하나에 <b>' + POINT + '점!</b><br>' +
      '     시계는 <b>첫 글자를 칠 때부터</b> 갑니다 — 자판을 찾는 동안은 안 가요.</p>' +
      '  <div class="claw-chiprow">' + chips + '</div>' +
      '  <p class="gintro-hint">못 치면 인형을 떨어뜨리고 하트가 하나 깨져요 · 하트 3개 · 모두 ' + TOTAL + '문제<br>' +
      '     1~3단계 5초 · 4~6단계 7초 · 7단계 8초 · 빨리 칠수록 빠르기 점수가 더 붙어요<br>' +
      '     하트 인형을 맞히면 하트가 하나 살아나요</p>' +
      '  <p class="gintro-go">엔터를 누르면 시작해요</p>' +
      '</div>';
  }

  /* =========================================================
     시작 — 기계를 그리고 첫 문제를 낸다
     ========================================================= */
  function start() {
    A.prepare('claw', introHtml());
    G = A.state();
    A.recKey('21문제');            // 이 게임은 늘 같은 21문제 코스라 기록판이 하나다

    var st = A.stage();
    var room = document.createElement('div');
    room.className = 'claw-room';
    room.innerHTML =
      '<div class="claw-machine">' +
      '  <div class="claw-board" id="claw-board">' +
      '    <div class="claw-bword" id="claw-bword">준비</div>' +
      '    <div class="claw-tbar" id="claw-tbar"><i id="claw-tb"></i></div>' +
      '    <div class="claw-bline"><span id="claw-tlb">치기 시작하면 시간이 가요</span>' +
      '      <b id="claw-sec">5.0초</b></div>' +
      '    <div class="claw-gain" id="claw-gain"><span class="g1"></span><span class="g2"></span></div>' +
      '  </div>' +
      '  <div class="claw-glass">' +
      '    <div class="claw-rail"></div>' +
      '    <div class="claw-aim" id="claw-aim"><span>제시문</span><i></i></div>' +
      '    <div class="claw-crane" id="claw-crane">' +
      '      <div class="claw-cart"></div>' +
      '      <div class="claw-cord"></div>' + HOOK_SVG +
      '    </div>' +
      '    <div class="claw-hole"></div>' +
      '    <div class="claw-gfloor"></div>' +
      '    <div class="claw-dolls" id="claw-dolls"></div>' +
      '  </div>' +
      '  <div class="claw-body">' +
      '    <div class="claw-lever"><i></i></div>' +
      '    <div class="claw-panel"><span class="joy"></span><b class="pb"></b><b class="pb"></b></div>' +
      '    <div class="claw-bar"></div>' +
      '    <div class="claw-card"></div>' +
      '    <div class="claw-chute"><div class="claw-tray" id="claw-tray"></div></div>' +
      '  </div>' +
      '</div>' +
      '<div class="claw-side">' +
      '  <div class="claw-hud">' +
      '    <span class="claw-ptbox" id="claw-pt">0</span><span class="claw-ptlb">point</span>' +
      '    <span class="claw-hearts" id="claw-hearts"></span>' +
      '  </div>' +
      '  <div class="claw-info">' +
      '    <div class="claw-stg"><b id="claw-stgno">1단계</b><span id="claw-stghint"></span></div>' +
      '    <div class="claw-qno"><b id="claw-qn">1</b> / ' + TOTAL + ' 문제</div>' +
      '  </div>' +
      '  <div class="claw-shelfbox" id="claw-shelfbox">' +
      '    <div class="claw-shelfhd">뽑은 인형 <b id="claw-got">0</b>개</div>' +
      '    <div class="claw-shelf" id="claw-shelf"></div>' +
      '  </div>' +
      '  <div class="claw-rules">' +
      '    <b>규칙 · 삼색 볼펜</b>' +
      '    <p>제시문 낱말을 제한시간 안에 치면 인형이 뽑혀요 (+' + POINT + '점)</p>' +
      '    <p>시계는 첫 글자를 칠 때부터 가요 — 빨리 칠수록 점수가 더 붙어요</p>' +
      '    <p>못 치면 인형을 떨어뜨리고 하트가 하나 깨져요</p>' +
      '    <p>한 단계에 3문제씩 7단계 — 모두 ' + TOTAL + '문제</p>' +
      '    <p>하트 인형을 제시간에 맞히면 하트가 하나 살아나요</p>' +
      '  </div>' +
      '</div>';
    st.appendChild(room);

    C = {
      phase: 'aim', pt: 0, seq: null, si: 0,
      lives: LIVES, done: 0, got: 0, stage: 0,
      dolls: [], target: null, tgtSlot: -1,
      craneX: 50, timeLeft: 0, limit: 5, armed: false, used: []
    };
    G.claw = C;
    G.items = [];

    for (var i = 0; i < SLOTS.length; i++) makeDoll(i, false);
    drawHearts();
    setCrane(50, REST_DROP);
    nextQuestion();
  }

  /* =========================================================
     낱말 고르기 — 규칙 4·7: 단계별 자리에 맞는 낱말만
     ========================================================= */
  function pickWord(stage) {
    var pool = (DATA.WORD_UPTO[stage] || []).slice();
    if (stage === 7 && DATA.WORD_BY_LEVEL && DATA.WORD_BY_LEVEL[7] &&
      DATA.WORD_BY_LEVEL[7].length > 20) {
      pool = DATA.WORD_BY_LEVEL[7].slice();      // 규칙 4: 7단계는 어려운 낱말
    }
    if (!pool.length) pool = DATA.WORDS.slice();

    // 제한시간이 짧은 단계는 짧은 낱말로 (5초 안에 칠 수 있게)
    var lo = stage <= 3 ? 3 : (stage <= 6 ? 4 : 5);
    var hi = stage <= 3 ? 6 : (stage <= 6 ? 9 : 11);
    var fit = pool.filter(function (w) {
      var n = A.keyLen(w);
      return n >= lo && n <= hi;
    });
    if (fit.length > 15) pool = fit;

    var floorWords = C ? C.dolls.map(function (d) { return d ? d.word : ''; }) : [];
    for (var t = 0; t < 40; t++) {
      var w = pool[Math.floor(Math.random() * pool.length)];
      if (C.used.indexOf(w) < 0 && floorWords.indexOf(w) < 0) {
        C.used.push(w);
        if (C.used.length > 24) C.used.shift();
        return w;
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* =========================================================
     인형 만들기 / 그리기
     ========================================================= */
  /** 한 줄에 같은 인형이 나란히 놓이지 않게 — 지금 바닥에 없는 종류부터 고른다 */
  function pickKind(exceptSlot) {
    var used = [];
    if (C && C.dolls) {
      for (var i = 0; i < C.dolls.length; i++) {
        if (i === exceptSlot || !C.dolls[i]) continue;
        used.push(C.dolls[i].kind);
      }
    }
    var free = KINDS.filter(function (k) { return used.indexOf(k) < 0; });
    var pool = free.length ? free : KINDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function makeDoll(slot, drop) {
    var stage = Math.max(1, C ? Math.floor(C.done / PER_STAGE) + 1 : 1);
    if (stage > STAGES) stage = STAGES;
    var kind = pickKind(slot);
    var el = document.createElement('div');
    el.className = 'claw-doll' + (drop ? ' in' : '');
    el.style.left = SLOTS[slot] + '%';
    el.style.bottom = FLOOR_B + '%';
    el.style.setProperty('--tilt', (Math.random() * 12 - 6).toFixed(1) + 'deg');
    el.innerHTML = dollSvg(kind) + '<span class="claw-word"></span>';
    A.el('claw-dolls').appendChild(el);

    var d = {
      slot: slot, kind: kind, el: el, wEl: el.querySelector('.claw-word'),
      word: pickWord(stage), x: SLOTS[slot], lock: false, matched: 0, dead: false
    };
    d.wEl.textContent = d.word;
    C.dolls[slot] = d;
    return d;
  }

  /** 인형의 종류·낱말을 새로 바꾼다 (제시문이 될 인형) */
  function reface(d, kind, word) {
    d.kind = kind;
    d.word = word;
    d.lock = false; d.matched = 0; d.dead = false;
    d.el.innerHTML = dollSvg(kind) + '<span class="claw-word"></span>';
    d.wEl = d.el.querySelector('.claw-word');
    d.wEl.textContent = word;
    d.el.classList.remove('in');
    void d.el.offsetWidth;
    d.el.classList.add('pop');
  }

  function setCrane(x, drop) {
    C.craneX = x;
    var cr = A.el('claw-crane');
    if (!cr) return;
    cr.style.left = x + '%';
    cr.style.setProperty('--drop', drop + '%');
  }
  function armsClosed(on) {
    var cr = A.el('claw-crane');
    if (cr) cr.classList.toggle('grip', !!on);
  }

  function drawHearts(liveAt) {
    var box = A.el('claw-hearts');
    if (!box) return;
    var out = '';
    for (var i = 0; i < LIVES; i++) {
      out += '<span class="claw-heart' + (i < C.lives ? '' : ' broke') +
        (liveAt === i ? ' live' : '') + '">' + HEART_HUD + '</span>';
    }
    box.innerHTML = out;
  }

  function addPoint(n) {
    A.bump(n);
    var pt = A.el('claw-pt');
    if (pt) pt.textContent = G.score;
  }

  /** 10점 / 빠르기 점수를 갈라 보여 준다 — 빨리 쳐도 이득이 없다는 말이 있었다 */
  function showGain(base, bonus) {
    var box = A.el('claw-gain');
    if (!box) return;
    box.children[0].textContent = '+' + base;
    box.children[1].textContent = bonus > 0 ? '+' + bonus : '';
    box.classList.remove('on');
    void box.offsetWidth;
    box.classList.add('on');
  }

  function shake() {
    var st = A.stage();
    st.classList.add('claw-shake');
    setTimeout(function () { st.classList.remove('claw-shake'); }, 430);
  }

  /* =========================================================
     문제 내기
     ========================================================= */
  function nextQuestion() {
    if (C.done >= TOTAL) { finish(true); return; }
    if (C.lives <= 0) { finish(false); return; }

    // 빈 자리는 새 인형으로 채운다 (위에서 툭 떨어진다)
    for (var i = 0; i < SLOTS.length; i++) {
      if (!C.dolls[i]) makeDoll(i, true);
    }

    var stage = Math.floor(C.done / PER_STAGE) + 1;
    if (stage > STAGES) stage = STAGES;
    if (stage !== C.stage) {
      C.stage = stage;
      var lv = DATA.getLevel(stage);
      A.el('claw-stgno').textContent = stage + '단계';
      A.el('claw-stghint').textContent = lv ? (lv.name + ' · ' + lv.hint) : '';
      if (C.done > 0) {
        A.flashItem({
          icon: '🎯', name: stage + '단계 · ' + (lv ? lv.name : '') + ' (' + LIMIT[stage] + '초)',
          color: '#ffd166'
        });
      }
    }
    A.el('claw-qn').textContent = (C.done + 1);
    A.progress(C.done / TOTAL);

    // 제시문이 될 인형 하나를 고른다 — 지난번과 다른 자리로
    var slot;
    for (var t = 0; t < 20; t++) {
      slot = Math.floor(Math.random() * SLOTS.length);
      if (slot !== C.tgtSlot) break;
    }
    C.tgtSlot = slot;
    var d = C.dolls[slot];
    // 규칙 9 — 가끔 하트 인형이 나온다 (목숨이 적을수록 자주)
    var rate = HEART_RATE[Math.max(1, Math.min(LIVES, C.lives))];
    var kind = Math.random() < rate ? 'heart' : pickKind(slot);
    reface(d, kind, pickWord(stage));

    C.dolls.forEach(function (x) { if (x) x.el.classList.remove('tgt'); });
    d.el.classList.add('tgt');
    C.target = d;
    G.items = [d];

    var aim = A.el('claw-aim');
    aim.style.left = d.x + '%';
    aim.classList.add('on');

    C.limit = LIMIT[stage];
    C.timeLeft = C.limit;
    C.armed = false;             // 시계는 첫 글자를 칠 때부터 간다
    showBoard(d);
    showTime();

    setCrane(d.x, REST_DROP);
    armsClosed(false);
    C.phase = 'aim'; C.pt = 0; C.seq = null;
    draw();
  }

  /** 기계 간판에 낱말을 띄운다 — 이 화면에서 제일 큰 글자 */
  function showBoard(d) {
    var w = A.el('claw-bword');
    if (!w) return;
    var n = d.word.length;
    // 긴 낱말은 간판 밖으로 나가지 않게 조금 줄인다
    var f = n <= 4 ? 1 : (n === 5 ? .84 : (n === 6 ? .72 : .62));
    w.style.setProperty('--wfs', f);
    w.innerHTML = A.wordHtml(d);
  }

  function showTime() {
    var bar = A.el('claw-tbar'), b = A.el('claw-tb');
    if (!bar || !b) return;
    var left = C.armed ? Math.max(0, C.timeLeft) : C.limit;
    b.style.width = (left / C.limit * 100) + '%';
    var s = A.el('claw-sec');
    if (s) s.textContent = left.toFixed(1) + '초';
    bar.classList.toggle('hot', C.armed && left <= C.limit * 0.35);
    bar.classList.toggle('idle', !C.armed);
    var lb = A.el('claw-tlb');
    if (lb) lb.textContent = C.armed ? '남은 시간' : '치기 시작하면 시간이 가요';
    var bd = A.el('claw-board');
    if (bd) bd.classList.toggle('waiting', !C.armed);
  }

  /** 첫 글자를 친 순간 — 여기서부터 제한시간(5·7·8초)을 잰다 */
  function armTimer() {
    if (C.armed) return;
    C.armed = true;
    A.sfx('tick');
    showTime();
  }

  /* =========================================================
     매 프레임 — 제한시간과 크레인 연출
     연출은 기획서의 핵심 그림이라 없애지 않고 길이만 줄였다 (2.47초 → 1.36초).
     21문제면 52초를 구경만 하던 것이 29초가 된다.
     ========================================================= */
  var SEQ_GRAB = [['down', 0.30], ['close', 0.16], ['up', 0.28], ['carry', 0.30], ['open', 0.32]];
  var SEQ_MISS = [['down', 0.28], ['close', 0.14], ['lift', 0.20], ['fall', 0.46]];

  function step(dt) {
    if (!C) return;
    if (C.phase === 'aim') {
      C.pt += dt;
      if (C.pt >= 0.3) { C.phase = 'play'; C.pt = 0; }
      return;
    }
    if (C.phase === 'play') {
      if (!C.armed) return;                    // 자판을 찾는 동안은 시계가 안 간다
      C.timeLeft -= dt;
      showTime();
      if (C.timeLeft <= 0) miss();
      return;
    }
    if (C.seq) {
      C.pt += dt;
      if (C.pt >= C.seq[C.si][1]) {
        C.si++;
        C.pt = 0;
        if (C.si >= C.seq.length) { var end = C.seqEnd; C.seq = null; end(); }
        else enterStep(C.seq[C.si][0]);
      }
    }
  }

  function runSeq(seq, endFn) {
    C.seq = seq; C.si = 0; C.pt = 0; C.seqEnd = endFn;
    C.phase = 'anim';
    enterStep(seq[0][0]);
  }

  function enterStep(name) {
    var d = C.target;
    if (!d) return;
    if (name === 'down') { setCrane(d.x, GRAB_DROP); }
    else if (name === 'close') { armsClosed(true); d.el.classList.add('held'); }
    else if (name === 'up') { setCrane(d.x, REST_DROP); d.el.style.bottom = '70%'; }
    else if (name === 'carry') { setCrane(CHUTE_X, REST_DROP); d.el.style.left = CHUTE_X + '%'; }
    else if (name === 'open') {
      armsClosed(false);
      d.el.classList.add('fall');
      d.el.style.bottom = '-30%';
      trayPop(d.kind);
    }
    else if (name === 'lift') { setCrane(d.x, 34); d.el.style.bottom = '42%'; }
    else if (name === 'fall') {
      // 규칙 6 — 인형뽑기가 인형을 떨어뜨린다
      armsClosed(false);
      d.el.classList.remove('held');
      d.el.classList.add('dropped');
      d.el.style.bottom = FLOOR_B + '%';
      breakHeart();
    }
  }

  /* ---------- 성공 (규칙 1) ---------- */
  function hit(item) {
    if (!C || (C.phase !== 'play' && C.phase !== 'aim')) return;
    if (item !== C.target) return;
    item.dead = true;
    G.items = [];

    G.keys += A.keyLen(item.word);
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    A.el('g-combo').textContent = G.combo;

    C.done++;
    C.got++;
    A.el('claw-got').textContent = C.got;

    /* 포인트 — 기획서의 10점은 그대로 두고, 남은 시간만큼 빠르기 점수를 얹는다 */
    var left = C.armed ? Math.max(0, C.timeLeft) : C.limit;
    var bonus = Math.round(left * SPEED_PT);
    addPoint(POINT + bonus);
    showGain(POINT, bonus);
    A.el('claw-aim').classList.remove('on');

    if (item.kind === 'heart') {
      // 규칙 9 (정한 것) — 하트 인형을 제시간에 맞히면 목숨 +1 (최대 3)
      if (C.lives < LIVES) {
        C.lives++;
        drawHearts(C.lives - 1);
        // 이 게임 최고의 순간 — 깨진 하트가 살아난다
        A.cheer({
          icon: '💗', name: '하트가 살아났어요!',
          sub: '하트 인형 +' + POINT + ' · 빠르기 +' + bonus,
          color: '#ff8fab'
        });
      } else {
        A.flashItem({ icon: '💗', name: '하트 인형! (하트가 가득해요) +' + (POINT + bonus), color: '#ff8fab' });
      }
    } else {
      A.flashItem({
        icon: '🧸',
        name: KIND_NAME[item.kind] + ' 인형! +' + POINT + ' · 빠르기 +' + bonus,
        color: '#ff8fab'
      });
    }

    runSeq(SEQ_GRAB, function () {
      var d = C.target;
      if (d) {
        d.el.remove();
        C.dolls[d.slot] = null;
      }
      C.target = null;
      nextQuestion();
    });
  }

  /* ---------- 실패 (규칙 2·6) ---------- */
  function miss() {
    if (!C || C.phase === 'anim') return;
    var d = C.target;
    if (d) d.dead = true;
    G.items = [];
    A.breakCombo();
    C.done++;
    A.el('claw-aim').classList.remove('on');
    C.timeLeft = 0;
    showTime();
    runSeq(SEQ_MISS, function () {
      if (C.target) {
        C.target.el.classList.remove('dropped', 'held', 'tgt');
        C.target.el.style.bottom = FLOOR_B + '%';
      }
      C.target = null;
      if (C.lives <= 0) { finish(false); return; }
      nextQuestion();
    });
  }

  function breakHeart() {
    C.lives--;
    if (C.lives < 0) C.lives = 0;
    drawHearts();
    var hs = A.el('claw-hearts').children;
    if (hs[C.lives]) hs[C.lives].classList.add('now');
    shake();
    A.flashItem({ icon: '💔', name: '인형을 떨어뜨렸어요! 하트 -1', color: '#ff6b81' });
  }

  /* ---------- 뽑은 인형이 배출구로 ---------- */
  function trayPop(kind) {
    var tray = A.el('claw-tray');
    if (tray) {
      var t = document.createElement('span');
      t.className = 'claw-traydoll';
      t.innerHTML = dollSvg(kind);
      tray.innerHTML = '';
      tray.appendChild(t);
    }
    var shelf = A.el('claw-shelf');
    if (shelf) {
      var s = document.createElement('span');
      s.className = 'claw-mini';
      s.innerHTML = dollSvg(kind);
      shelf.appendChild(s);
      var box = A.el('claw-shelfbox');
      if (box) box.classList.add('has');       // 비어 있을 땐 상자가 줄어들어 있다
    }
  }

  function finish(win) {
    A.progress(C.done / TOTAL);
    var msg = win
      ? '🧸 ' + TOTAL + '문제 끝! 인형을 ' + C.got + '개 뽑았어요'
      : '💔 하트가 다 깨졌어요 — 인형 ' + C.got + '개';
    A.gameOver(msg, win);
  }

  /* ---------- 낱말 표시 갱신 ---------- */
  function draw() {
    if (!C) return;
    // 아이가 첫 글자를 친 순간 시계가 간다 (엔진은 입력이 있을 때마다 draw 를 부른다)
    if (!C.armed && (C.phase === 'play' || C.phase === 'aim')) {
      var inp = A.el('gamein');
      if (inp && inp.value) armTimer();
    }
    C.dolls.forEach(function (d) {
      if (!d) return;
      if (d === C.target && !d.dead) d.wEl.innerHTML = A.wordHtml(d);
      else d.wEl.textContent = d.word;
      d.el.classList.toggle('lock', !!d.lock);
    });
    if (C.target && !C.target.dead) {
      var bw = A.el('claw-bword');
      if (bw) bw.innerHTML = A.wordHtml(C.target);
    }
  }

  GAMES.register('claw', {
    name: '낱말 뽑기', credit: '삼색 볼펜', icon: '🧸',
    desc: '인형뽑기 기계예요. 제시간 안에 낱말을 치면 인형이 뽑힙니다. 못 치면 하트가 하나 깨져요!',
    pdf: 'game_vibe/20260818104945.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
