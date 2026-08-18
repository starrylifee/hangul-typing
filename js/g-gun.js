/* g-gun.js — 장전하고 쏘세요 (기획 · 평범한 사람들)
   game_vibe/20260818105033.pdf 의 규칙과 그림을 그대로 옮겼다.

   규칙(원문) 그대로 옮긴 자리
     1. 대기시간 5초를 기다리고 시작한다              → WAIT / step()
     2. 낱말을 써서 총을 장전한다                     → hit()  (낱말 하나 = 총알 하나)
     3. 움직이는 캐릭터를 마우스로 맞춘다.
        맞추면 돈과 점수를 준다                       → onFire() / MONEY_PER_HIT
     4. 맞출수록 더 빨라진다                          → MON_SPEED_UP
     5. 제한시간은 67초다                             → TIME
     6. 끝                                            → finish()
     · 맞출 때마다 100원. 돈으로 한 탄창에 총알이
       더 많은 총을 산다                              → GUNS (3발 무료/5발 5000원/6발 10000원)
     · 랜덤 스킨 뽑기 (꽝 없음) 커먼80 레어50
       에픽30 레전더리0.67                            → RARITY (가중치로 읽었다)
     ※ "총과 다른 색의 탄창을 입력하면 점수가 깎인다" 는 글씨가 겹쳐 판독이 안 되어 넣지 않았다.

   돈과 산 총은 판이 끝나도 남는다 → APP.rec.gunShop
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var WAIT = 5;                 // 규칙 1 — 대기시간 5초
  var TIME = 67;                // 규칙 5 — 제한시간 67초
  var MONEY_PER_HIT = 100;      // 맞출 때마다 100원

  var GUNS = [
    { id: 'basic', name: '기본 총', ammo: 3, price: 0 },
    { id: 'mid', name: '중간 총', ammo: 5, price: 5000 },
    { id: 'last', name: '마지막 총', ammo: 6, price: 10000 }
  ];
  /* 기획서의 80 / 50 / 30 / 0.67 은 합이 100이 아니라 가중치로 읽었다 */
  var RARITY = [
    { id: 'common', name: '커먼', w: 80, color: '#9fb2c9' },
    { id: 'rare', name: '레어', w: 50, color: '#5ad4e6' },
    { id: 'epic', name: '에픽', w: 30, color: '#c58cff' },
    { id: 'legend', name: '레전더리', w: 0.67, color: '#ffcc5c' }
  ];

  /* ---------- 기획서에 없어서 정한 값 ---------- */
  var DRAW_COST = 1000;         // 스킨 한 번 뽑는 값
  var DUP_BACK = 500;           // 이미 가진 스킨이 나오면 돌려주는 돈 (꽝 없음이라서)
  var HIT_SCORE = 100;          // 몬스터를 맞혔을 때 점수 (낱말 점수는 장전할 때 따로)
  var MON_SPEED0 = 12;          // 몬스터 처음 속도 (판 너비 %/초)
  var MON_SPEED_UP = 2.2;       // 규칙 4 — 한 번 맞힐 때마다 빨라지는 정도
  var MON_SPEED_MAX = 52;
  var WIN_HITS = 5;             // 이만큼 맞히면 "잘했어요"

  /* 단계 표 색 (기획서 시작 화면의 칸 색 그대로) */
  var LV_COLOR = ['', '#4aa3ff', '#3ec8e0', '#5ed17a', '#ffd94a', '#ff9a3c', '#ff6b8a', '#b9722e'];

  /* ---------- 스킨 (총 색) ---------- */
  var SKINS = {
    common: [
      { id: 'c1', name: '무쇠', c1: '#98a6b8', c2: '#5d6775' },
      { id: 'c2', name: '모래', c1: '#dcc79c', c2: '#a8905f' },
      { id: 'c3', name: '수풀', c1: '#9ccb8f', c2: '#5e8a58' }
    ],
    rare: [
      { id: 'r1', name: '바다', c1: '#79dcef', c2: '#2f89a8' },
      { id: 'r2', name: '자수정', c1: '#b79cf0', c2: '#6d4fb8' }
    ],
    epic: [
      { id: 'e1', name: '번개', c1: '#ffe98a', c2: '#c78a12' },
      { id: 'e2', name: '장미', c1: '#ff9ec4', c2: '#c03d78' }
    ],
    legend: [
      { id: 'l1', name: '황금 용', c1: '#ffe08a', c2: '#c9821a' }
    ]
  };
  var ALL_SKINS = {};
  (function () {
    for (var k in SKINS) {
      for (var i = 0; i < SKINS[k].length; i++) {
        var s = SKINS[k][i];
        s.rar = k;
        ALL_SKINS[s.id] = s;
      }
    }
  })();

  /* =========================================================
     저장 — 돈·산 총·스킨은 판을 넘어 남는다 (내 전용 키만 쓴다)
     ========================================================= */
  function shop() {
    if (!APP.rec.gunShop) APP.rec.gunShop = {};
    var s = APP.rec.gunShop;
    if (typeof s.money !== 'number') s.money = 0;
    if (!s.gun) s.gun = 'basic';
    if (!s.owned || !s.owned.length) s.owned = ['basic'];
    if (!s.skins) s.skins = [];
    if (!s.skin) s.skin = '';
    if (!s.best) s.best = { score: 0, acc: 0 };
    return s;
  }
  function saveShop() { APP.save(); }

  function gunOf(id) {
    for (var i = 0; i < GUNS.length; i++) if (GUNS[i].id === id) return GUNS[i];
    return GUNS[0];
  }
  function skinColors() {
    var s = shop();
    var sk = ALL_SKINS[s.skin];
    return sk ? [sk.c1, sk.c2] : ['#c9d3e2', '#6b7688'];
  }

  /* =========================================================
     그림 (SVG) — 기획서 그림을 그대로 옮겼다
     ========================================================= */
  /* 총 — 시작 화면·상점·탄창에 쓴다 */
  function gunSvg(cls, c1, c2) {
    return '<svg class="' + cls + '" viewBox="0 0 130 92" aria-hidden="true">' +
      // 손잡이
      '<path d="M34 48 L68 48 L58 88 L24 88 Z" fill="' + c2 + '" stroke="#15181f" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<g stroke="#15181f" stroke-width="2" opacity=".45">' +
      '<path d="M32 60 H62"/><path d="M30 70 H60"/></g>' +
      // 방아쇠울 · 방아쇠
      '<path d="M68 50 C80 52 82 64 72 68 L60 68" fill="none" stroke="#15181f" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M64 50 L62 62" stroke="#15181f" stroke-width="4" stroke-linecap="round"/>' +
      // 몸통
      '<path d="M10 14 L90 14 L90 48 L34 48 L10 40 Z" fill="' + c1 + '" stroke="#15181f" stroke-width="3.4" stroke-linejoin="round"/>' +
      // 총열
      '<rect x="90" y="22" width="32" height="20" rx="5" fill="' + c2 + '" stroke="#15181f" stroke-width="3.4"/>' +
      '<circle cx="120" cy="32" r="5" fill="#15181f"/>' +
      // 위쪽 홈 · 가늠쇠
      '<path d="M18 22 H82" stroke="#15181f" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>' +
      '<path d="M78 14 L83 5 L88 14 Z" fill="#15181f"/>' +
      '</svg>';
  }

  /* 몬스터 — 빨간 뿔, 노란 눈, 가슴에 하트, 꼬리, 검은 발 (기획서 플레이 화면) */
  var MON_SVG =
    '<svg class="gun-monsvg" viewBox="0 0 130 124" aria-hidden="true">' +
    // 꼬리
    '<path d="M40 96 C16 96 8 78 20 66" fill="none" stroke="#2a0c0c" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M20 66 L8 60 L11 74 Z" fill="#2a0c0c"/>' +
    // 팔 (위로 든 자세)
    '<path d="M32 70 L12 50" stroke="#c22f2b" stroke-width="11" stroke-linecap="round"/>' +
    '<path d="M98 70 L118 50" stroke="#c22f2b" stroke-width="11" stroke-linecap="round"/>' +
    '<path d="M12 50 l-5 -8 M12 50 l-8 3" stroke="#c22f2b" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M118 50 l5 -8 M118 50 l8 3" stroke="#c22f2b" stroke-width="6" stroke-linecap="round"/>' +
    // 몸통
    '<path d="M36 104 C28 70 40 44 65 44 C90 44 102 70 94 104 Z" fill="#d6342f"/>' +
    // 머리
    '<ellipse cx="65" cy="48" rx="32" ry="27" fill="#e2453b"/>' +
    // 뿔
    '<path d="M40 32 L28 6 L54 26 Z" fill="#1b0a0a"/>' +
    '<path d="M90 32 L102 6 L76 26 Z" fill="#1b0a0a"/>' +
    // 눈 (노랑)
    '<ellipse cx="52" cy="45" rx="9" ry="7" fill="#ffd23f"/>' +
    '<ellipse cx="78" cy="45" rx="9" ry="7" fill="#ffd23f"/>' +
    '<ellipse cx="53" cy="46" rx="3.4" ry="4.4" fill="#2a0c0c"/>' +
    '<ellipse cx="77" cy="46" rx="3.4" ry="4.4" fill="#2a0c0c"/>' +
    // 입 + 송곳니
    '<path d="M48 60 Q65 76 82 60 Z" fill="#3d0909"/>' +
    '<path d="M54 62 L58 71 L62 62 Z" fill="#fff"/>' +
    '<path d="M68 62 L72 71 L76 62 Z" fill="#fff"/>' +
    // 가슴 하트
    '<path d="M65 100 C48 88 45 76 54 71 C60 68 64 72 65 76 C66 72 70 68 76 71 C85 76 82 88 65 100 Z" ' +
    'fill="#ff9ec4" stroke="#7c2447" stroke-width="2.6"/>' +
    // 검은 발
    '<path d="M30 104 L40 96 L48 106 L56 96 L64 106 L72 96 L80 106 L88 96 L100 104 L100 116 L30 116 Z" fill="#141414"/>' +
    '</svg>';

  /* 키보드 위의 두 손 (기획서 아래쪽 그림) */
  var HANDS_SVG =
    '<svg class="gun-handsvg" viewBox="0 0 240 120" aria-hidden="true">' +
    '<g fill="#f6e6d6" stroke="#3a2a20" stroke-width="3" stroke-linejoin="round">' +
    '<path d="M52 120 L52 62 C52 44 66 32 84 32 C102 32 116 44 116 62 L116 120 Z"/>' +
    '<path d="M188 120 L188 62 C188 44 174 32 156 32 C138 32 124 44 124 62 L124 120 Z"/>' +
    '</g>' +
    '<g fill="none" stroke="#c9ab92" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M70 118 V64"/><path d="M98 118 V64"/>' +
    '<path d="M142 118 V64"/><path d="M170 118 V64"/>' +
    '</g>' +
    '</svg>';

  var G, C;

  /* =========================================================
     시작 화면 (기획서 3쪽 왼쪽) — 총 그림 · 제목 · PLAY · 상점 · 단계 표 1~7
     ========================================================= */
  var curLevel = 1;

  function introHtml() {
    var col = skinColors();
    var cells = '', names = '';
    for (var n = 1; n <= 7; n++) {
      var lv = DATA.getLevel(n);
      cells += '<button class="gun-lvc' + (n === curLevel ? ' sel' : '') + '" data-lv="' + n + '" ' +
        'style="--lc:' + LV_COLOR[n] + '">' + n + '</button>';
      names += '<span class="gun-lvn' + (n === curLevel ? ' sel' : '') + '">' +
        A.esc(lv ? lv.name : (n + '단계')) + '</span>';
    }
    return '<div class="gun-introbg"></div>' +
      '<button class="gun-introshop" id="gun-ishop">' +
      gunSvg('gun-minigun', col[0], col[1]) + '<b>상점</b></button>' +
      '<div class="gun-introbox">' +
      '  <p class="gintro-by">학생이 만든 게임 · 기획 평범한 사람들</p>' +
      '  <div class="gun-bigun">' + gunSvg('gun-gunsvg', col[0], col[1]) + '</div>' +
      '  <h2 class="gun-title"><span>장전하고 쏘세요</span></h2>' +
      '  <p class="gun-introdesc">낱말을 쳐서 총을 <b>장전</b>하고, 움직이는 몬스터를 <b>마우스로</b> 쏘세요.<br>' +
      '     맞출 때마다 <b>100원</b> · 맞출수록 몬스터가 빨라져요 · 제한시간 <b>67초</b></p>' +
      '  <button class="gun-play" id="gun-play">PLAY</button>' +
      '  <div class="gun-lvbox">' +
      '    <div class="gun-lvhd">단계</div>' +
      '    <div class="gun-lvrow">' + cells + '</div>' +
      '    <div class="gun-lvrow names">' + names + '</div>' +
      '  </div>' +
      '  <p class="gintro-go">PLAY 를 누르면 시작해요 (대기시간 5초)</p>' +
      '</div>';
  }

  /* =========================================================
     게임 시작
     ========================================================= */
  function start() {
    if (keyGuard) { document.removeEventListener('keydown', keyGuard, true); keyGuard = null; }
    A.prepare('gun', introHtml());
    G = A.state();
    var s = shop();
    var gun = gunOf(s.gun);

    C = {
      level: curLevel,
      wait: WAIT, left: TIME,
      ammo: 0, cap: gun.ammo,
      hits: 0, shots: 0,
      mx: 50, my: 0, dir: 1, bob: 0,
      speed: MON_SPEED0,
      dead: false, respawn: 0,
      paused: false, over: false,
      prev: [], next: []
    };
    G.gun = C;

    buildStage();
    bindIntro();

    // 낱말 준비 — 앞뒤 카드에 보일 것까지
    C.next = [pickWord(), pickWord()];
    newWord();
    updateAll();
  }

  /* ---------- 낱말 고르기 — 고른 단계의 자판으로만 ---------- */
  function pickWord() {
    var pool = (DATA.WORD_UPTO[C ? C.level : curLevel] || []).slice();
    if (!pool.length) pool = DATA.WORDS.slice();
    // 장전은 빨라야 재미있다 — 너무 긴 낱말은 뺀다
    var fit = pool.filter(function (w) { var n = A.keyLen(w); return n >= 2 && n <= 8; });
    if (fit.length > 15) pool = fit;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* =========================================================
     플레이 화면 (기획서 4쪽) — 시간 막대 / 버튼 / 몬스터 / 키보드와 두 손
     ========================================================= */
  function kbRows() {
    var rows = [
      ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
      ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
      ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']
    ];
    var out = '';
    for (var r = 0; r < rows.length; r++) {
      out += '<div class="gun-krow">';
      for (var i = 0; i < rows[r].length; i++) out += '<span class="gun-key">' + rows[r][i] + '</span>';
      out += '</div>';
    }
    out += '<div class="gun-krow"><span class="gun-key space"></span></div>';
    return out;
  }

  function buildStage() {
    var st = A.stage();
    var col = skinColors();
    var wrap = document.createElement('div');
    wrap.className = 'gun-wrap';
    wrap.innerHTML =
      // 시간 막대 (빨강·주황·노랑·연두 + 끝에 남은 초)
      '<div class="gun-timebar">' +
      '  <div class="gun-tsegs"><i style="background:#e2504f"></i><i style="background:#f08b3c"></i>' +
      '  <i style="background:#f4d13d"></i><i style="background:#a8d94a"></i></div>' +
      '  <div class="gun-tmask" id="gun-tmask"></div>' +
      '  <span class="gun-tsec" id="gun-tsec">' + TIME + '초</span>' +
      '</div>' +

      '<div class="gun-field" id="gun-field">' +
      // 왼쪽 위 버튼
      '  <div class="gun-lbtns">' +
      '    <button class="gun-b gun-stop" id="gun-pause">멈추기</button>' +
      '    <button class="gun-b gun-out" id="gun-exit">나가기</button>' +
      '    <button class="gun-b gun-shopb" id="gun-shop">상점</button>' +
      '  </div>' +
      // 오른쪽 위 표시 (힘·점수·돈)
      '  <div class="gun-rstats">' +
      '    <div class="gun-s pw"><b>힘</b><span id="gun-pw">0 / 3</span></div>' +
      '    <div class="gun-s sc"><b>점수</b><span id="gun-sc">0</span></div>' +
      '    <div class="gun-s mn"><b>돈</b><span id="gun-mn">0원</span></div>' +
      '  </div>' +
      // 몬스터
      '  <div class="gun-mon" id="gun-mon">' + MON_SVG +
      '    <span class="gun-monsay">움직임</span></div>' +
      '  <div class="gun-ground"></div>' +
      '  <div class="gun-move"><span>←</span><b>좌우로 움직여요</b><span>→</span></div>' +
      // 탄창
      '  <div class="gun-magbox">' +
      '    <span class="gun-maglb">탄창</span><span class="gun-mag" id="gun-mag"></span>' +
      '  </div>' +
      '  <div class="gun-wait" id="gun-wait"></div>' +
      '</div>' +

      // 키보드와 두 손 + 키캡 위의 낱말
      '<div class="gun-kbwrap">' +
      '  <div class="gun-cards">' +
      '    <span class="gun-card p2" id="gun-p2"></span>' +
      '    <span class="gun-card p1" id="gun-p1"></span>' +
      '    <span class="gun-card now" id="gun-now"><i></i></span>' +
      '    <span class="gun-card n1" id="gun-n1"></span>' +
      '    <span class="gun-card n2" id="gun-n2"></span>' +
      '  </div>' +
      '  <div class="gun-kb">' + kbRows() + '</div>' +
      HANDS_SVG +
      '</div>';
    st.appendChild(wrap);

    wrap.style.setProperty('--gc1', col[0]);
    wrap.style.setProperty('--gc2', col[1]);

    A.el('gun-pause').onclick = function (e) { e.stopPropagation(); togglePause(); };
    A.el('gun-exit').onclick = function (e) {
      e.stopPropagation();
      var b = A.el('btn-game-exit');
      if (b) b.click();
    };
    A.el('gun-shop').onclick = function (e) { e.stopPropagation(); openShop('play'); };

    A.el('gun-field').addEventListener('click', onFire);
    A.el('gun-field').addEventListener('mousemove', onAim);
  }

  /* ---------- 인트로 안 버튼 (인트로 아무 데나 누르면 넘어가므로 조심) ---------- */
  function bindIntro() {
    var st = A.stage();
    var iv = st.querySelector('.gintro');
    if (!iv) return;
    var sb = iv.querySelector('#gun-ishop');
    if (sb) sb.onclick = function (e) { e.stopPropagation(); openShop('intro'); };
    var cells = iv.querySelectorAll('.gun-lvc');
    for (var i = 0; i < cells.length; i++) {
      cells[i].onclick = function (e) {
        e.stopPropagation();
        curLevel = parseInt(this.getAttribute('data-lv'), 10);
        if (C) C.level = curLevel;
        var cs = iv.querySelectorAll('.gun-lvc'), ns = iv.querySelectorAll('.gun-lvn');
        for (var k = 0; k < cs.length; k++) {
          var on = (k + 1) === curLevel;
          cs[k].classList.toggle('sel', on);
          ns[k].classList.toggle('sel', on);
        }
        // 단계를 바꾸면 낱말도 바꿔 준다
        C.next = [pickWord(), pickWord()];
        newWord();
      };
    }
    // PLAY 는 인트로를 그대로 닫는다 (클릭이 인트로로 올라간다)
  }

  /* =========================================================
     낱말 — 가운데 카드 하나가 지금 칠 낱말 (규칙 2)
     ========================================================= */
  function newWord() {
    var w = C.next.shift();
    if (!w) w = pickWord();
    C.next.push(pickWord());
    var el = A.el('gun-now');
    var it = {
      word: w, el: el, wEl: el.querySelector('i'),
      lock: false, matched: 0, dead: false
    };
    G.items = [it];
    drawCards();
    draw();
  }

  function drawCards() {
    var p1 = A.el('gun-p1'), p2 = A.el('gun-p2');
    var n1 = A.el('gun-n1'), n2 = A.el('gun-n2');
    if (!p1) return;
    p1.textContent = C.prev[0] || '';
    p2.textContent = C.prev[1] || '';
    n1.textContent = C.next[0] || '';
    n2.textContent = C.next[1] || '';
  }

  function draw() {
    if (!C || !G || !G.items.length) return;
    var it = G.items[0];
    if (!it.wEl) return;
    it.wEl.innerHTML = A.wordHtml(it);
    it.el.classList.toggle('lock', !!it.lock);
  }

  /* ---------- 낱말을 다 쳤다 = 장전 완료 (규칙 2) ---------- */
  function hit(item) {
    if (!C || C.over) return;
    item.dead = true;
    G.items = [];

    A.addScore(item.word);                     // 낱말을 친 점수
    C.prev.unshift(item.word);
    if (C.prev.length > 2) C.prev.pop();

    if (C.ammo >= C.cap) {
      A.flashItem({ icon: '🚫', name: '탄창이 가득 찼어요 — 먼저 쏘세요!', color: '#ffcc5c' });
    } else {
      C.ammo++;
      var el = A.el('gun-now');
      if (el) {
        el.classList.add('load');
        setTimeout(function () { if (el) el.classList.remove('load'); }, 320);
      }
    }
    updateMag();
    newWord();
  }

  /* =========================================================
     사격 — 마우스로 몬스터를 맞춘다 (규칙 3)
     ========================================================= */
  function onAim(e) {
    if (!C || C.over) return;
    var f = A.el('gun-field');
    if (!f) return;
    var r = f.getBoundingClientRect();
    f.style.setProperty('--ax', (e.clientX - r.left) + 'px');
    f.style.setProperty('--ay', (e.clientY - r.top) + 'px');
  }

  function onFire(e) {
    if (!C || C.over || C.paused) return;
    if (e.target && e.target.closest && e.target.closest('button')) return;
    if (C.wait > 0) {
      A.flashItem({ icon: '⏳', name: '대기시간이에요 — 그 사이에 장전하세요', color: '#5ad4e6' });
      return;
    }
    if (C.ammo <= 0) {
      A.flashItem({ icon: '🔫', name: '총알이 없어요! 낱말을 쳐서 장전하세요', color: '#ff9aad' });
      shakeMag();
      return;
    }
    var f = A.el('gun-field');
    var r = f.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;

    C.ammo--;
    C.shots++;
    updateMag();
    mark(x, y, false);

    var mon = A.el('gun-mon');
    var got = false;
    if (mon && !C.dead) {
      var m = mon.getBoundingClientRect();
      got = e.clientX >= m.left && e.clientX <= m.right &&
        e.clientY >= m.top && e.clientY <= m.bottom;
    }
    if (got) monHit(x, y);
  }

  function monHit(x, y) {
    var s = shop();
    C.hits++;
    C.dead = true;
    C.respawn = 0.45;

    s.money += MONEY_PER_HIT;                  // 맞출 때마다 100원
    saveShop();
    A.bump(HIT_SCORE);                          // 맞추면 점수도 준다

    // 규칙 4 — 맞출수록 더 빨라진다
    C.speed = Math.min(MON_SPEED_MAX, MON_SPEED0 + C.hits * MON_SPEED_UP);

    var mon = A.el('gun-mon');
    if (mon) mon.classList.add('dead');
    mark(x, y, true);
    popText(x, y, '+' + MONEY_PER_HIT + '원');
    updateStats();
  }

  function mark(x, y, hitOk) {
    var f = A.el('gun-field');
    if (!f) return;
    var d = document.createElement('span');
    d.className = 'gun-mark' + (hitOk ? ' ok' : '');
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    f.appendChild(d);
    setTimeout(function () { d.remove(); }, hitOk ? 620 : 420);
  }
  function popText(x, y, t) {
    var f = A.el('gun-field');
    if (!f) return;
    var d = document.createElement('span');
    d.className = 'gun-pop';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.textContent = t;
    f.appendChild(d);
    setTimeout(function () { d.remove(); }, 900);
  }
  function shakeMag() {
    var m = A.el('gun-magbox') || document.querySelector('.gun-magbox');
    if (!m) return;
    m.classList.add('shake');
    setTimeout(function () { m.classList.remove('shake'); }, 420);
  }

  /* =========================================================
     매 프레임
     ========================================================= */
  function step(dt) {
    if (!C || C.over || C.paused) return;

    // 규칙 1 — 대기시간 5초 (그 사이에 장전은 된다)
    if (C.wait > 0) {
      C.wait -= dt;
      var w = A.el('gun-wait');
      if (w) {
        if (C.wait > 0) w.innerHTML = '<b>' + Math.ceil(C.wait) + '</b><span>대기시간 · 지금 장전하세요</span>';
        else { w.innerHTML = ''; w.classList.add('off'); }
      }
      return;
    }

    // 규칙 5 — 67초
    C.left -= dt;
    if (C.left <= 0) { C.left = 0; showTime(); finish(); return; }
    showTime();
    A.progress(1 - C.left / TIME);

    // 몬스터 — 좌우로 움직인다
    if (C.dead) {
      C.respawn -= dt;
      if (C.respawn <= 0) respawnMon();
      return;
    }
    C.mx += C.speed * C.dir * dt;
    if (C.mx < 12) { C.mx = 12; C.dir = 1; }
    if (C.mx > 88) { C.mx = 88; C.dir = -1; }
    C.bob += dt * 3.2;
    moveMon();
  }

  function respawnMon() {
    C.dead = false;
    C.mx = 14 + Math.random() * 72;
    C.dir = Math.random() < 0.5 ? -1 : 1;
    var mon = A.el('gun-mon');
    if (mon) {
      mon.classList.remove('dead');
      mon.classList.add('in');
      setTimeout(function () { if (mon) mon.classList.remove('in'); }, 340);
    }
    moveMon();
  }

  function moveMon() {
    var mon = A.el('gun-mon');
    if (!mon) return;
    mon.style.left = C.mx + '%';
    mon.style.setProperty('--bob', (Math.sin(C.bob) * 5).toFixed(2) + 'px');
    mon.classList.toggle('flip', C.dir < 0);
  }

  function showTime() {
    var m = A.el('gun-tmask'), s = A.el('gun-tsec');
    if (!m) return;
    m.style.width = (1 - C.left / TIME) * 100 + '%';
    s.textContent = Math.ceil(C.left) + '초';
    s.classList.toggle('low', C.left <= 10);
  }

  function updateMag() {
    var box = A.el('gun-mag');
    if (!box) return;
    var out = '';
    for (var i = 0; i < C.cap; i++) out += '<i class="' + (i < C.ammo ? 'on' : '') + '"></i>';
    box.innerHTML = out;
    updateStats();
  }
  function updateStats() {
    var s = shop();
    var pw = A.el('gun-pw'), sc = A.el('gun-sc'), mn = A.el('gun-mn');
    if (pw) pw.textContent = C.ammo + ' / ' + C.cap;
    if (sc) sc.textContent = G.score;
    if (mn) mn.textContent = won(s.money);
  }
  function updateAll() {
    updateMag();
    showTime();
    var w = A.el('gun-wait');
    if (w) w.innerHTML = '<b>' + WAIT + '</b><span>대기시간 · 지금 장전하세요</span>';
    moveMon();
  }

  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }

  /* ---------- 멈추기 ---------- */
  function togglePause() {
    if (C.over) return;
    C.paused = !C.paused;
    var f = A.el('gun-field');
    var b = A.el('gun-pause');
    if (b) b.textContent = C.paused ? '계속하기' : '멈추기';
    var old = f.querySelector('.gun-paused');
    if (old) old.remove();
    if (C.paused) {
      var d = document.createElement('div');
      d.className = 'gun-paused';
      d.innerHTML = '<b>멈춤</b><span>「계속하기」를 누르세요</span>';
      f.appendChild(d);
    }
    focusIn();
  }
  function focusIn() {
    var i = A.el('gamein');
    if (i && !i.disabled) setTimeout(function () { i.focus(); }, 0);
  }

  /* =========================================================
     상점 (기획서 3쪽 오른쪽 아래)
     ========================================================= */
  function rarityPct() {
    var tot = 0, i;
    for (i = 0; i < RARITY.length; i++) tot += RARITY[i].w;
    var out = [];
    for (i = 0; i < RARITY.length; i++) out.push(RARITY[i].w / tot * 100);
    return out;
  }

  function openShop(from) {
    var st = A.stage();
    if (st.querySelector('.gun-shopwrap')) return;
    if (from === 'play' && C && !C.paused && !C.over) {
      C.paused = true;
      C.shopPaused = true;
      var pb = A.el('gun-pause');
      if (pb) pb.textContent = '계속하기';
    }
    var ov = document.createElement('div');
    ov.className = 'gun-shopwrap';
    ov.onclick = function (e) { e.stopPropagation(); };
    st.appendChild(ov);
    // 상점을 열어 둔 채 엔터를 누르면 뒤에서 게임이 시작돼 버린다 — 막는다
    keyGuard = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeShop(); }
    };
    document.addEventListener('keydown', keyGuard, true);
    renderShop(ov);
  }

  var keyGuard = null;

  function closeShop() {
    var st = A.stage();
    var ov = st.querySelector('.gun-shopwrap');
    if (ov) ov.remove();
    if (keyGuard) { document.removeEventListener('keydown', keyGuard, true); keyGuard = null; }
    if (C && C.shopPaused) {
      C.shopPaused = false;
      C.paused = false;
      var pb = A.el('gun-pause');
      if (pb) pb.textContent = '멈추기';
      var p = st.querySelector('.gun-paused');
      if (p) p.remove();
    }
    // 총·스킨이 바뀌었을 수 있다
    if (C) {
      C.cap = gunOf(shop().gun).ammo;
      if (C.ammo > C.cap) C.ammo = C.cap;
      updateMag();
      var wrap = st.querySelector('.gun-wrap');
      if (wrap) {
        var col = skinColors();
        wrap.style.setProperty('--gc1', col[0]);
        wrap.style.setProperty('--gc2', col[1]);
      }
    }
    focusIn();
  }

  function renderShop(ov) {
    var s = shop();
    var pct = rarityPct();
    var i, g, out;

    out = '<div class="gun-shopbox">' +
      '<div class="gun-shophd"><b>상점</b>' +
      '<span class="gun-shopmn">돈 <i id="gun-shopmn">' + won(s.money) + '</i></span>' +
      '<button class="gun-b gun-close" id="gun-shopx">닫기</button></div>' +
      '<div class="gun-shopbody">' +
      '<div class="gun-shopsec"><h4>총 — 한 탄창에 들어가는 총알</h4><div class="gun-gunrow">';
    for (i = 0; i < GUNS.length; i++) {
      g = GUNS[i];
      var have = s.owned.indexOf(g.id) >= 0;
      var on = s.gun === g.id;
      out += '<div class="gun-gcard' + (on ? ' on' : '') + '" data-gun="' + g.id + '">' +
        '<div class="gun-gpic">' + gunSvg('gun-gunsvg sm', skinColors()[0], skinColors()[1]) +
        '<span class="gun-gprice">' + (g.price ? won(g.price) : '무료') + '</span></div>' +
        '<b>' + g.name + '</b><span class="gun-gammo">' + g.ammo + '발</span>' +
        '<button class="gun-b gun-buy" data-buy="' + g.id + '">' +
        (on ? '쓰는 중' : (have ? '이 총 쓰기' : '사기')) + '</button>' +
        '</div>';
    }
    out += '</div></div>';

    // 랜덤 스킨 뽑기
    out += '<div class="gun-shopsec gacha"><h4>랜덤 스킨 뽑기 <em>※꽝 없음</em></h4>' +
      '<div class="gun-gachabox">' +
      '<div class="gun-gachaL">' +
      '<div class="gun-skinstrip">';
    var strip = ['common', 'rare', 'epic', 'legend'];
    for (i = 0; i < strip.length; i++) {
      var sk = SKINS[strip[i]][0];
      out += '<span class="gun-skchip" style="--c1:' + sk.c1 + ';--c2:' + sk.c2 + '">' +
        gunSvg('gun-gunsvg xs', sk.c1, sk.c2) +
        '<em style="color:' + rarColor(strip[i]) + '">' + rarName(strip[i]) + '</em></span>';
    }
    out += '</div>' +
      '<button class="gun-b gun-draw" id="gun-draw">뽑기 (' + won(DRAW_COST) + ')</button>' +
      '<div class="gun-drawout" id="gun-drawout"></div>' +
      '</div>' +
      '<div class="gun-gachaR"><div class="gun-rhd">확률</div>';
    for (i = 0; i < RARITY.length; i++) {
      out += '<div class="gun-rrow" style="--rc:' + RARITY[i].color + '">' +
        '<b>' + RARITY[i].name + '</b><span>' + RARITY[i].w + '%</span>' +
        '<em>실제 ' + pct[i].toFixed(pct[i] < 1 ? 2 : 1) + '%</em></div>';
    }
    out += '</div></div></div>';

    // 가진 스킨
    out += '<div class="gun-shopsec"><h4>가진 스킨 <em>누르면 총 색이 바뀌어요</em></h4>' +
      '<div class="gun-myskins" id="gun-myskins">';
    if (!s.skins.length) out += '<span class="gun-none">아직 없어요 — 뽑아 보세요</span>';
    for (i = 0; i < s.skins.length; i++) {
      var k = ALL_SKINS[s.skins[i]];
      if (!k) continue;
      out += '<button class="gun-myskin' + (s.skin === k.id ? ' on' : '') + '" data-skin="' + k.id + '">' +
        gunSvg('gun-gunsvg xs', k.c1, k.c2) +
        '<b>' + k.name + '</b><span style="color:' + rarColor(k.rar) + '">' + rarName(k.rar) + '</span></button>';
    }
    out += '</div></div>';
    out += '</div></div>';
    ov.innerHTML = out;

    ov.querySelector('#gun-shopx').onclick = function (e) { e.stopPropagation(); closeShop(); };
    var buys = ov.querySelectorAll('[data-buy]');
    for (i = 0; i < buys.length; i++) {
      buys[i].onclick = function (e) { e.stopPropagation(); buyGun(this.getAttribute('data-buy'), ov); };
    }
    ov.querySelector('#gun-draw').onclick = function (e) { e.stopPropagation(); drawSkin(ov); };
    var ms = ov.querySelectorAll('[data-skin]');
    for (i = 0; i < ms.length; i++) {
      ms[i].onclick = function (e) {
        e.stopPropagation();
        var sh = shop();
        sh.skin = this.getAttribute('data-skin');
        saveShop();
        renderShop(ov);
      };
    }
  }

  function rarName(id) {
    for (var i = 0; i < RARITY.length; i++) if (RARITY[i].id === id) return RARITY[i].name;
    return id;
  }
  function rarColor(id) {
    for (var i = 0; i < RARITY.length; i++) if (RARITY[i].id === id) return RARITY[i].color;
    return '#fff';
  }

  function buyGun(id, ov) {
    var s = shop();
    var g = gunOf(id);
    if (s.owned.indexOf(id) >= 0) { s.gun = id; saveShop(); renderShop(ov); return; }
    if (s.money < g.price) {
      var d = ov.querySelector('#gun-drawout');
      if (d) d.innerHTML = '<span class="bad">돈이 모자라요 — ' + won(g.price - s.money) + ' 더 필요해요</span>';
      return;
    }
    s.money -= g.price;
    s.owned.push(id);
    s.gun = id;
    saveShop();
    renderShop(ov);
    A.flashItem({ icon: '🔫', name: g.name + ' 을(를) 샀어요! 한 탄창 ' + g.ammo + '발', color: '#6ee7a0' });
  }

  /* 꽝 없음 — 가중치로 등급을 뽑고 그 등급 안에서 스킨 하나 */
  function drawSkin(ov) {
    var s = shop();
    var out = ov.querySelector('#gun-drawout');
    if (s.money < DRAW_COST) {
      out.innerHTML = '<span class="bad">돈이 모자라요 — 뽑기는 ' + won(DRAW_COST) + '</span>';
      return;
    }
    s.money -= DRAW_COST;

    var tot = 0, i;
    for (i = 0; i < RARITY.length; i++) tot += RARITY[i].w;
    var r = Math.random() * tot, pickRar = RARITY[0];
    for (i = 0; i < RARITY.length; i++) {
      r -= RARITY[i].w;
      if (r <= 0) { pickRar = RARITY[i]; break; }
    }
    var list = SKINS[pickRar.id];
    var sk = list[Math.floor(Math.random() * list.length)];

    var dup = s.skins.indexOf(sk.id) >= 0;
    if (dup) s.money += DUP_BACK;
    else { s.skins.push(sk.id); s.skin = sk.id; }
    saveShop();
    renderShop(ov);

    var o2 = ov.querySelector('#gun-drawout');
    o2.innerHTML = '<span class="got" style="--rc:' + pickRar.color + '">' +
      gunSvg('gun-gunsvg xs', sk.c1, sk.c2) +
      '<b>' + pickRar.name + '</b> ' + sk.name + ' 총' +
      (dup ? ' <em>이미 있어요 · ' + won(DUP_BACK) + ' 돌려줌</em>' : ' <em>새로 얻었어요!</em>') +
      '</span>';
  }

  /* =========================================================
     끝 화면 (기획서 3쪽 오른쪽 위)
     ========================================================= */
  function finish() {
    if (C.over) return;
    C.over = true;

    var s = shop();
    var acc = (G.keys + G.errors) > 0
      ? Math.round(G.keys / (G.keys + G.errors) * 100) : 100;
    var prevScore = s.best.score || 0;
    var prevAcc = s.best.acc || 0;
    if (G.score > prevScore) s.best.score = G.score;
    if (acc > prevAcc) s.best.acc = acc;
    saveShop();

    var win = C.hits >= WIN_HITS;
    A.gameOver('67초 끝! 몬스터를 ' + C.hits + '마리 맞혔어요', win);

    var st = A.stage();
    var ov = document.createElement('div');
    ov.className = 'gun-end';
    ov.innerHTML =
      '<div class="gun-endbox">' +
      '  <div class="gun-endhd">' +
      '    <div class="gun-endL">' +
      '      <span class="gun-endtag">' + gunSvg('gun-gunsvg xs', skinColors()[0], skinColors()[1]) +
      '        <b>' + A.esc(gunOf(s.gun).name) + '</b></span>' +
      '      <button class="gun-b gun-shopb" id="gun-eshop">상점</button>' +
      '    </div>' +
      '    <h3 class="gun-endttl">끝</h3>' +
      '    <div class="gun-endbtns">' +
      '      <button class="gun-b gun-again" id="gun-again">다시하기</button>' +
      '      <button class="gun-b gun-next" id="gun-next">다음 단계</button>' +
      '    </div>' +
      '  </div>' +
      '  <table class="gun-endtb"><thead><tr>' +
      '    <th>점수</th><th>오타 수</th><th>맞춘 수</th><th>단계</th><th>정확도</th><th>타수</th>' +
      '  </tr></thead><tbody><tr>' +
      '    <td>' + G.score + '</td><td>' + G.errors + '</td><td>' + C.hits + '</td>' +
      '    <td>' + C.level + '단계</td><td>' + acc + '%</td><td>' + (G.cpm || 0) + '</td>' +
      '  </tr></tbody><tfoot><tr>' +
      '    <td colspan="3">최대 점수 <b>' + s.best.score + '</b></td>' +
      '    <td colspan="3">최대 정확도 <b>' + s.best.acc + '%</b></td>' +
      '  </tr></tfoot></table>' +
      '  <div class="gun-endmn">이번에 번 돈 <b>' + won(C.hits * MONEY_PER_HIT) + '</b>' +
      '    <span>· 모은 돈 <b>' + won(s.money) + '</b> (다음 판에도 남아요)</span></div>' +
      '  <div class="gun-endout"><button class="gun-b gun-out" id="gun-eout">그만하기</button></div>' +
      '</div>';
    st.appendChild(ov);

    A.el('gun-again').onclick = function (e) { e.stopPropagation(); start(); };
    A.el('gun-next').onclick = function (e) {
      e.stopPropagation();
      curLevel = Math.min(7, curLevel + 1);
      start();
    };
    A.el('gun-eshop').onclick = function (e) { e.stopPropagation(); openShop('end'); };
    A.el('gun-eout').onclick = function (e) {
      e.stopPropagation();
      var b = A.el('btn-game-exit');
      if (b) b.click();
    };
  }

  GAMES.register('gun', {
    name: '장전하고 쏘세요', credit: '평범한 사람들', icon: '🔫',
    desc: '낱말을 쳐서 총을 장전하고, 움직이는 몬스터를 마우스로 쏘세요. 맞출 때마다 100원! 돈을 모아 총을 삽니다.',
    pdf: 'game_vibe/20260818105033.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
