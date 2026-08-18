/* g-base.js — 야구게임 (기획 · 해산물 연합팀)
   game_vibe/20260818105044.pdf 의 규칙과 그림을 그대로 옮겼다.

   기획서 규칙(원문)을 옮긴 자리
     1. 게임을 시작하면 청팀과 백팀으로 나눈다 (팀 배치는 랜덤)   → pickTeam()
     2. 공격할 때 야구공 속도는 랜덤으로 2초~10초                 → FLY_MIN / FLY_MAX
     3. 타자가 오답을 쓰거나 제한시간 안에 못 쓰면 스트라이크
        (볼은 없다)                                              → strike() / wrongInput()
     4. 답을 맞히면 난이도에 따라 안타·2루타·3루타,
        홈런은 1/20 확률                                          → swing() / HOMER
     5. 수비 때 못 쓰면 상대가 안타·2루타·3루타,
        수비가 맞으면 아웃 또는 fly out                            → concede() / defOut()
     6. 낱말은 야구공에 쓰여 있다                                  → .base-ball 안의 낱말
     · 단계별 자리 = 이 앱의 1~7단계                               → DATA.WORD_UPTO[n]

   기획서에 없어서 정한 것 (보고서에도 적었다)
     · 3이닝 (동점이면 최대 6회까지 연장) — 한 판 5~7분
     · 난이도별 안타/2루타/3루타 비율 (HITMIX / CPUMIX)
     · 오답은 곧바로 스트라이크로 잡는다 (한/영 키가 영문일 때는 봐준다)
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var FLY_MIN = 2;                 // 규칙 2 — 공 속도 2초
  var FLY_MAX = 10;                // 규칙 2 — 공 속도 10초
  var HOMER = 1 / 20;              // 규칙 4 — 홈런 1/20
  var STRIKES = 3;                 // 규칙 3 — 삼진 (볼 없음)
  var OUTS = 3;                    // 야구 규칙

  /* ---------- 기획서에 없어서 정한 값 ---------- */
  var INNINGS = 3;                 // 3이닝 — 초등학생이 5~7분에 끝낼 수 있는 길이
  var MAX_INNINGS = 6;             // 동점이면 연장, 6회에서 무승부
  /* 한 이닝은 아웃 3개 또는 타석 6번까지.
     맞히면 무조건 안타라(규칙 4) 잘 치는 아이는 아웃이 안 나와 이닝이 안 끝난다.
     반대로 수비를 못 하는 아이는 점수를 끝없이 내주게 된다. 둘 다 막는 장치다. */
  var MAX_PA = 6;
  /* 난이도별 안타 / 2루타 / 3루타 비율 (홈런 1/20 을 뺀 나머지를 나눈다).
     어려운 난이도일수록 낱말이 어려우니 쳤을 때 더 크게 쳐 준다. */
  var HITMIX = { easy: [75, 20, 5], normal: [60, 28, 12], hard: [45, 33, 22] };
  /* 수비에서 놓쳤을 때 상대가 치는 비율 — 어려울수록 상대도 크게 친다 */
  var CPUMIX = { easy: [80, 15, 5], normal: [70, 22, 8], hard: [55, 30, 15] };
  var DIFFNAME = { easy: '쉬움', normal: '보통', hard: '하드' };
  /* 난이도별로 한 타석에 쓸 낱말 길이(타수) 범위 */
  var DIFFLEN = { easy: [3, 7], normal: [4, 10], hard: [5, 14] };

  var TEAM = {
    blue: { key: 'blue', name: '청팀', c1: '#3b82f6', c2: '#1d4ed8', ink: '#eaf2ff' },
    white: { key: 'white', name: '백팀', c1: '#f4f6fa', c2: '#c8ced9', ink: '#1b2333' }
  };

  var G, C;

  /* =========================================================
     그림 — 기획서 3·4쪽을 SVG 로 옮겼다
     ========================================================= */

  /* 야구장 — 초록 잔디 + 주황 다이아몬드 + 베이스 네 개 (기획서 3쪽)
     preserveAspectRatio="none" 이라 viewBox 좌표가 곧 화면의 % 다.
     기획서 그림도 가로로 납작한 다이아몬드라 오히려 그림에 가깝다. */
  function fieldSvg() {
    var s = '<svg class="base-fieldsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
    s += '<defs>' +
      '<linearGradient id="bsGrass" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8fd14f"/><stop offset="1" stop-color="#4fa32b"/></linearGradient>' +
      '<linearGradient id="bsDirt" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f0a35e"/><stop offset="1" stop-color="#d9762f"/></linearGradient>' +
      '</defs>';
    // 잔디
    s += '<rect x="0" y="0" width="100" height="100" fill="url(#bsGrass)"/>';
    // 크레용으로 세로로 그은 듯한 잔디 결 (기획서 그림의 초록 세로 선)
    for (var i = 0; i < 25; i++) {
      s += '<rect x="' + (i * 4) + '" y="0" width="2" height="100" fill="#ffffff" opacity="' +
        (i % 2 ? '.08' : '.03') + '"/>';
    }
    // 외야 담장
    s += '<path d="M0 16 C26 2 74 2 100 16 L100 0 L0 0 Z" fill="#2f6b3a"/>';
    s += '<path d="M0 16 C26 2 74 2 100 16" fill="none" stroke="#f6f2e2" stroke-width="1.6"/>';
    // 주황 다이아몬드(내야) — 바깥 주황, 안쪽 초록이라 베이스 길이 띠로 보인다
    s += '<polygon points="50,6 96,52 50,98 4,52" fill="url(#bsDirt)"/>';
    s += '<polygon points="50,19 81,52 50,85 19,52" fill="url(#bsGrass)" opacity=".95"/>';
    // 마운드
    s += '<ellipse cx="50" cy="46" rx="10" ry="7.5" fill="url(#bsDirt)"/>';
    s += '<rect x="47.5" y="44.5" width="5" height="1.8" rx=".8" fill="#fdfaf0"/>';
    // 홈 주변 흙과 타석
    s += '<ellipse cx="50" cy="90" rx="17" ry="10" fill="url(#bsDirt)"/>';
    s += '<rect x="33" y="83" width="7" height="13" fill="none" stroke="#fdfaf0" stroke-width="1"/>';
    s += '<rect x="60" y="83" width="7" height="13" fill="none" stroke="#fdfaf0" stroke-width="1"/>';
    // 베이스 네 개
    s += base3(88, 52) + base3(50, 14) + base3(12, 52);
    // 홈플레이트 (오각형)
    s += '<polygon points="50,94.5 46,91.5 46,88 54,88 54,91.5" fill="#fdfaf0" stroke="#c9c2a8" stroke-width=".5"/>';
    s += '</svg>';
    return s;
  }
  function base3(x, y) {
    return '<polygon points="' + x + ',' + (y - 4) + ' ' + (x + 4.5) + ',' + y + ' ' +
      x + ',' + (y + 4) + ' ' + (x - 4.5) + ',' + y + '" fill="#fdfaf0" stroke="#cdc6ad" stroke-width=".5"/>';
  }

  /* 투수 — 기획서 그림의 "가운데 위에서 공을 던지는 사람" */
  function pitcherSvg() {
    return '<svg viewBox="0 0 100 130" aria-hidden="true">' +
      '<ellipse cx="50" cy="126" rx="26" ry="4" fill="rgba(0,0,0,.22)"/>' +
      // 다리
      '<path class="bpk" d="M44 78 L36 118" /><path class="bpk" d="M56 78 L66 116"/>' +
      '<path class="bps" d="M36 118 L28 120"/><path class="bps" d="M66 116 L74 118"/>' +
      // 몸통(유니폼)
      '<path class="bpj" d="M50 34 C36 34 32 46 32 58 L34 82 L66 82 L68 58 C68 46 64 34 50 34 Z"/>' +
      '<path class="bpn" d="M50 34 L50 82" />' +
      // 던지는 팔 + 공
      '<path class="bpa" d="M64 46 C78 40 86 28 84 18"/>' +
      '<path class="bpa" d="M36 48 C26 54 22 64 24 72"/>' +
      '<circle class="bph" cx="24" cy="74" r="5"/>' +
      '<circle cx="86" cy="14" r="6.5" fill="#fdfcf7" stroke="#c9331f" stroke-width="1.6"/>' +
      // 머리 + 모자
      '<circle class="bph" cx="50" cy="22" r="12"/>' +
      '<path class="bpc" d="M38 19 C38 9 62 9 62 19 Z"/>' +
      '<path class="bpc" d="M62 19 L74 21 L62 23 Z"/>' +
      '</svg>';
  }

  /* 타자 — 홈플레이트에 서 있다 (배트를 든 사람) */
  function batterSvg() {
    return '<svg viewBox="0 0 100 130" aria-hidden="true">' +
      '<ellipse cx="50" cy="126" rx="24" ry="4" fill="rgba(0,0,0,.22)"/>' +
      '<path class="bpk" d="M45 80 L38 120"/><path class="bpk" d="M57 80 L66 120"/>' +
      '<path class="bps" d="M38 120 L30 122"/><path class="bps" d="M66 120 L74 122"/>' +
      '<path class="bpj" d="M50 36 C37 36 33 48 33 60 L35 84 L67 84 L69 60 C69 48 63 36 50 36 Z"/>' +
      '<path class="bpa" d="M66 50 C76 44 80 34 78 26"/>' +
      '<path class="bpa" d="M36 50 C46 42 60 34 74 30"/>' +
      '<path d="M74 30 L96 6" stroke="#c98a4b" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<circle cx="98" cy="4" r="4" fill="#2b2f3a"/>' +
      '<circle class="bph" cx="50" cy="24" r="12"/>' +
      '<path class="bpc" d="M38 21 C38 11 62 11 62 21 Z"/>' +
      '<path class="bpc" d="M38 21 L34 24 L38 25 Z"/>' +
      '</svg>';
  }

  /* 야구공 — 하얀 공에 빨간 실밥 (기획서: 낱말이 공에 쓰여 있다) */
  function ballSvg() {
    return '<svg class="base-ballsvg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="46" fill="#fdfcf7" stroke="#b9b3a2" stroke-width="2"/>' +
      '<path d="M22 14 C36 30 36 70 22 86" fill="none" stroke="#d3261a" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M78 14 C64 30 64 70 78 86" fill="none" stroke="#d3261a" stroke-width="3.4" stroke-linecap="round"/>' +
      seams(26, 22, 78) + seams(74, 22, 78) +
      '</svg>';
  }
  function seams(x, y0, y1) {
    var s = '', n = 7, i, y;
    for (i = 0; i < n; i++) {
      y = y0 + (y1 - y0) * (i / (n - 1));
      var d = x < 50 ? -7 : 7;
      s += '<path d="M' + x + ' ' + y + ' l' + d + ' ' + (i < n / 2 ? 4 : -4) +
        '" stroke="#d3261a" stroke-width="2" stroke-linecap="round" fill="none"/>';
    }
    return s;
  }

  /* 배트 — 기획서 아래쪽 입력창 왼쪽에 있는 그 배트 */
  function batSvg() {
    return '<svg class="base-batsvg" viewBox="0 0 220 44" aria-hidden="true">' +
      '<defs><linearGradient id="bsBat" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#e0b076"/><stop offset="1" stop-color="#a9743a"/></linearGradient></defs>' +
      '<path d="M60 22 C60 12 84 6 130 6 L206 6 C216 6 216 38 206 38 L130 38 C84 38 60 32 60 22 Z" fill="url(#bsBat)" stroke="#6d4520" stroke-width="2.5"/>' +
      '<rect x="26" y="15" width="36" height="14" rx="6" fill="#2c2c30" stroke="#141417" stroke-width="2.5"/>' +
      '<path d="M34 15 L34 29 M42 15 L42 29 M50 15 L50 29" stroke="#6d6d75" stroke-width="1.6"/>' +
      '<ellipse cx="20" cy="22" rx="10" ry="12" fill="#3a3a40" stroke="#141417" stroke-width="2.5"/>' +
      '</svg>';
  }

  /* 해 — 기획서 4쪽 왼쪽 위 (노란 동그라미 + 빛살) */
  function sunSvg() {
    var s = '<svg class="base-sunsvg" viewBox="0 0 100 100" aria-hidden="true"><g class="rays">';
    for (var i = 0; i < 12; i++) {
      var a = i * 30 * Math.PI / 180;
      s += '<line x1="' + (50 + 34 * Math.cos(a)).toFixed(1) + '" y1="' + (50 + 34 * Math.sin(a)).toFixed(1) +
        '" x2="' + (50 + 47 * Math.cos(a)).toFixed(1) + '" y2="' + (50 + 47 * Math.sin(a)).toFixed(1) +
        '" stroke="#e8a92c" stroke-width="2.6" stroke-linecap="round"/>';
    }
    s += '</g><circle cx="50" cy="50" r="29" fill="#ffe14d" stroke="#e8a92c" stroke-width="2.4"/></svg>';
    return s;
  }

  /* 갈색 야구 글러브 — 기획서 4쪽 가운데 (손목에서 팔이 오른쪽 아래로 뻗는다)
     야구 글러브로 읽히게 하는 세 가지 — 뭉툭한 네 갈래, 왼쪽으로 벌어진 엄지,
     그 둘 사이를 잇는 X 자 가죽끈(웨빙). 웨빙이 없으면 그냥 손처럼 보인다. */
  function gloveSvg() {
    return '<svg class="base-glovesvg" viewBox="0 0 176 220" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="bsGlv" x1=".15" y1="0" x2=".85" y2="1">' +
      '<stop offset="0" stop-color="#d9924e"/><stop offset="1" stop-color="#8d4a1b"/></linearGradient>' +
      '<linearGradient id="bsGlv2" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#c9813f"/><stop offset="1" stop-color="#8a4718"/></linearGradient>' +
      '<radialGradient id="bsGlvP" cx="46%" cy="40%" r="60%">' +
      '<stop offset="0" stop-color="#63300e" stop-opacity=".45"/>' +
      '<stop offset="1" stop-color="#63300e" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      // 팔 — 손목에서 오른쪽 아래로 (기획서 그림). 굵은 선 두 겹으로 테두리를 만든다
      '<path d="M114 148 L152 192" stroke="#5a2c0d" stroke-width="34" stroke-linecap="round" fill="none"/>' +
      '<path d="M114 148 L152 192" stroke="#f2c79b" stroke-width="27" stroke-linecap="round" fill="none"/>' +
      // 하얀 소매(손목 밴드)
      '<g transform="rotate(-45 134 170)">' +
      '<rect x="114" y="156" width="40" height="28" rx="6" fill="#f8f9fc" stroke="#5a2c0d" stroke-width="3.2"/></g>' +
      // 손가락 네 갈래 — 뭉툭하고 짧게 (포켓이 주인공)
      '<g fill="url(#bsGlv2)" stroke="#5a2c0d" stroke-width="3.4" stroke-linejoin="round">' +
      '<g transform="rotate(-14 86 112)"><rect x="73" y="40" width="26" height="76" rx="13"/></g>' +
      '<g transform="rotate(-4 108 112)"><rect x="95" y="33" width="26" height="83" rx="13"/></g>' +
      '<g transform="rotate(7 129 112)"><rect x="116" y="37" width="26" height="79" rx="13"/></g>' +
      '<g transform="rotate(19 148 116)"><rect x="136" y="50" width="24" height="68" rx="12"/></g>' +
      '</g>' +
      // 손바닥(포켓)
      '<path d="M62 118 C62 88 84 72 112 72 C142 72 161 90 160 120 C159 152 135 172 106 172 ' +
      'C76 172 62 150 62 118 Z" fill="url(#bsGlv)" stroke="#5a2c0d" stroke-width="3.8"/>' +
      // 엄지 — 왼쪽으로 크게 벌어진다 (밑동은 손바닥 밑으로 들어간다)
      '<g transform="rotate(-16 62 152)">' +
      '<rect x="46" y="74" width="30" height="90" rx="15" fill="url(#bsGlv2)" stroke="#5a2c0d" stroke-width="3.4"/>' +
      '</g>' +
      // 웨빙 — 엄지와 검지 사이를 잇는 X 자 가죽끈.
      // 손가락 위로 떠 보이지 않게 손가락 밑동 아래(엄지·검지 사이 골)로 내렸다
      '<path d="M42 112 L68 82 L92 108 L66 142 Z" fill="#bb7434" stroke="#5a2c0d" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<g stroke="#f0d3a4" stroke-width="3.2" stroke-linecap="round" fill="none">' +
      '<path d="M51 102 L75 132 M59 93 L83 123 M50 123 L76 93 M58 132 L84 102"/>' +
      '</g>' +
      '<ellipse cx="112" cy="122" rx="44" ry="36" fill="url(#bsGlvP)"/>' +
      // 손가락 사이 이음선
      '<g stroke="#6b3612" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".8">' +
      '<path d="M96 74 L94 88 M118 74 L119 88 M138 78 L142 92"/>' +
      '</g>' +
      // 포켓의 바느질 자국
      '<path d="M76 126 C94 114 130 114 148 128" fill="none" stroke="#f2d6ac" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 7"/>' +
      '<path d="M80 146 C96 136 128 136 142 146" fill="none" stroke="#f2d6ac" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="7 7" opacity=".85"/>' +
      '<path d="M66 132 C72 156 90 172 112 173" fill="none" stroke="#f2d6ac" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="6 8" opacity=".7"/>' +
      '</svg>';
  }

  /* =========================================================
     인트로 — 기획서 3쪽 오른쪽 "시작 화면"
     "단계를 선택하세요 / 1~7단계", "난이도: 쉬움, 보통, 하드"
     ========================================================= */
  function introHtml() {
    var lv = '', i, d;
    for (i = 1; i <= 7; i++) {
      lv += '<button type="button" class="base-chip" data-lv="' + i + '">' + i + '단계</button>';
    }
    var dk = ['easy', 'normal', 'hard'], df = '';
    for (i = 0; i < dk.length; i++) {
      d = dk[i];
      df += '<button type="button" class="base-chip" data-df="' + d + '">' + DIFFNAME[d] + '</button>';
    }
    var me = TEAM[C.mine], you = TEAM[C.cpu];
    return '<div class="base-introbg"></div>' +
      '<div class="gintro-box base-introbox">' +
      '  <p class="gintro-by">학생이 만든 게임 · 기획 해산물 연합팀</p>' +
      '  <h2>야구게임 ⚾</h2>' +
      '  <div class="base-teams">' +
      '    <span class="base-tteam ' + me.key + ' me">나 · ' + me.name + '</span>' +
      '    <span class="base-vs">VS</span>' +
      '    <span class="base-tteam ' + you.key + '">컴퓨터 · ' + you.name + '</span>' +
      '    <em>팀 배치는 랜덤</em>' +
      '  </div>' +
      '  <p class="base-selt">단계를 선택하세요</p>' +
      '  <div class="base-chiprow" id="base-lvrow">' + lv + '</div>' +
      '  <p class="base-selt">난이도</p>' +
      '  <div class="base-chiprow" id="base-dfrow">' + df + '</div>' +
      '  <p class="gintro-hint">공에 적힌 낱말을 치면 안타 · 못 치거나 오답이면 스트라이크 (볼은 없어요)<br>' +
      '     홈런은 스무 번에 한 번! 수비 때 맞히면 아웃, 놓치면 상대가 안타 · ' + INNINGS + '이닝</p>' +
      '  <p class="gintro-go">엔터를 누르면 경기 시작</p>' +
      '</div>';
  }

  /* =========================================================
     경기장 화면
     ========================================================= */
  function shellHtml() {
    return '' +
      /* ---- 공격 화면 (기획서 3쪽) ---- */
      '<div class="base-att">' +
      fieldSvg() +
      '  <div class="base-runner r1" id="base-r1"></div>' +
      '  <div class="base-runner r2" id="base-r2"></div>' +
      '  <div class="base-runner r3" id="base-r3"></div>' +
      '  <div class="base-pitcher" id="base-pitcher">' + pitcherSvg() + '</div>' +
      '  <div class="base-batter">' + batterSvg() + '</div>' +
      '  <div class="base-scorebox" id="base-scorebox"><b id="base-sb-me">0</b><i>:</i><b id="base-sb-you">0</b></div>' +
      '  <div class="base-inbar att">' + batSvg() +
      '    <div class="base-inbox" id="base-inbox-a"><span class="ph">단어를 입력하세요</span></div>' +
      '  </div>' +
      '</div>' +
      /* ---- 수비 화면 (기획서 4쪽) ---- */
      '<div class="base-def">' +
      '  <div class="base-sun">' + sunSvg() + '</div>' +
      '  <div class="base-cloud c1"></div><div class="base-cloud c2"></div>' +
      '  <div class="base-glove" id="base-glove">' + gloveSvg() + '</div>' +
      '  <div class="base-inbar def">' +
      '    <div class="base-inbox def" id="base-inbox-d"><span class="ph">단어를 쓰시오</span></div>' +
      '  </div>' +
      '</div>' +
      /* ---- 공 (두 화면이 같이 쓴다) ---- */
      '<div class="base-ball" id="base-ball">' + ballSvg() +
      '  <span class="base-word" id="base-word"></span>' +
      '</div>' +
      /* ---- 오른쪽 위 스코어보드 (기획서 4쪽) ---- */
      '<div class="base-board">' +
      '  <div class="base-btable">' +
      '    <div class="row white"><span class="t">백</span><span class="n" id="base-bd-white">0</span></div>' +
      '    <div class="row blue"><span class="t">청</span><span class="n" id="base-bd-blue">0</span></div>' +
      '  </div>' +
      '  <div class="base-bside">' +
      '    <div class="base-inn"><i id="base-inn-ar">▲</i><b id="base-inn-no">1</b><span>회</span>' +
      '      <em id="base-pa">타석 1/' + MAX_PA + '</em></div>' +
      '    <div class="base-onbase"><span class="lb">진루</span>' +
      '      <span class="dia" id="base-d3"></span><span class="dia" id="base-d2"></span><span class="dia" id="base-d1"></span>' +
      '    </div>' +
      '    <div class="base-outs"><span class="lb">아웃</span>' +
      '      <span class="o" id="base-o1"></span><span class="o" id="base-o2"></span><span class="o" id="base-o3"></span>' +
      '    </div>' +
      '    <div class="base-strikes"><span class="lb">스트라이크</span>' +
      '      <span class="s" id="base-s1"></span><span class="s" id="base-s2"></span><span class="s" id="base-s3"></span>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="base-half" id="base-half"></div>' +
      '<div class="base-banner" id="base-banner"></div>';
  }

  /* =========================================================
     시작
     ========================================================= */
  function start() {
    // 규칙 1 — 청팀 / 백팀 랜덤 배치
    var mine = Math.random() < 0.5 ? 'blue' : 'white';
    C = {
      mine: mine, cpu: mine === 'blue' ? 'white' : 'blue',
      stage: 1, diff: 'normal',
      inning: 1, top: true,            // top=true 면 우리 공격(초)
      outs: 0, strikes: 0, pa: 0,
      bases: [false, false, false],
      run: { me: 0, cpu: 0 },
      outsDone: 0,
      phase: 'init', wait: 0,
      fly: 0, t: 0, ball: null, used: []
    };

    A.prepare('base', introHtml());
    G = A.state();
    G.base = C;
    G.items = [];

    // 앱에서 고른 단계·난이도를 기본값으로
    C.stage = (G.level && G.level.no) || 1;
    C.diff = G.diff && HITMIX[G.diff.id] ? G.diff.id : 'easy';

    var wrap = document.createElement('div');
    wrap.className = 'base-wrap attack';
    wrap.innerHTML = shellHtml();
    A.stage().appendChild(wrap);
    C.wrap = wrap;
    setTeamColors();

    bindIntro();
    showBoard();
    showBall(false);
    updHead();
  }

  /** 인트로의 단계·난이도 버튼 (인트로를 클릭하면 넘어가니 stopPropagation 필수) */
  function bindIntro() {
    var st = A.stage();
    var mark = function (row, attr, val) {
      var bs = row.querySelectorAll('button'), i;
      for (i = 0; i < bs.length; i++) {
        bs[i].classList.toggle('on', bs[i].getAttribute(attr) === String(val));
      }
    };
    var lvRow = st.querySelector('#base-lvrow');
    var dfRow = st.querySelector('#base-dfrow');
    if (!lvRow || !dfRow) return;

    var click = function (row, attr, set) {
      row.addEventListener('click', function (e) {
        var b = e.target;
        while (b && b !== row && b.tagName !== 'BUTTON') b = b.parentNode;
        if (!b || b === row) return;
        e.stopPropagation();
        set(b.getAttribute(attr));
        mark(row, attr, b.getAttribute(attr));
        updHead();
      });
    };
    click(lvRow, 'data-lv', function (v) { C.stage = parseInt(v, 10) || 1; });
    click(dfRow, 'data-df', function (v) { if (HITMIX[v]) C.diff = v; });
    mark(lvRow, 'data-lv', C.stage);
    mark(dfRow, 'data-df', C.diff);
  }

  function updHead() {
    var h = A.el('game-lv');
    if (h) {
      h.textContent = C.stage + '단계 · ' + DIFFNAME[C.diff] + ' · 나는 ' + TEAM[C.mine].name;
    }
  }

  function setTeamColors() {
    var w = C.wrap;
    w.style.setProperty('--me1', TEAM[C.mine].c1);
    w.style.setProperty('--me2', TEAM[C.mine].c2);
    w.style.setProperty('--meink', TEAM[C.mine].ink);
    w.style.setProperty('--you1', TEAM[C.cpu].c1);
    w.style.setProperty('--you2', TEAM[C.cpu].c2);
    w.style.setProperty('--youink', TEAM[C.cpu].ink);
  }

  /* =========================================================
     낱말 고르기 — 단계별 자리 (DATA.WORD_UPTO) + 공 속도에 맞는 길이
     ========================================================= */
  function pickWord(sec) {
    var pool = (DATA.WORD_UPTO[C.stage] || []).slice();
    if (!pool.length) pool = DATA.WORDS.slice();

    var lim = DIFFLEN[C.diff] || DIFFLEN.normal;
    // 2초짜리 빠른 공에 열 글자 낱말이 나오면 손도 못 대니 공 속도에 길이를 맞춘다
    var byTime = Math.max(3, Math.round(sec * 1.8));
    var lo = lim[0], hi = Math.min(lim[1], byTime);
    if (hi < lo) hi = lo;

    var fit = pool.filter(function (w) {
      var n = A.keyLen(w);
      return n >= lo && n <= hi;
    });
    if (fit.length < 6) {
      fit = pool.filter(function (w) { return A.keyLen(w) <= hi + 2; });
    }
    if (!fit.length) fit = pool;

    for (var t = 0; t < 30; t++) {
      var w = fit[Math.floor(Math.random() * fit.length)];
      if (C.used.indexOf(w) < 0) {
        C.used.push(w);
        if (C.used.length > 20) C.used.shift();
        return w;
      }
    }
    return fit[Math.floor(Math.random() * fit.length)];
  }

  /* =========================================================
     한 타석(공 하나) 던지기
     ========================================================= */
  function pitch() {
    // 규칙 2 — 공 속도는 랜덤으로 2초 ~ 10초
    C.fly = FLY_MIN + Math.random() * (FLY_MAX - FLY_MIN);
    C.t = 0;
    C.lane = 30 + Math.random() * 40;      // 수비 때 공이 떨어지는 자리
    var word = pickWord(C.fly);

    var ballEl = A.el('base-ball');
    var wEl = A.el('base-word');
    wEl.className = 'base-word n' + Math.min(7, word.length);
    var it = {
      word: word, el: ballEl, wEl: wEl,
      lock: false, matched: 0, dead: false
    };
    C.ball = it;
    G.items = [it];
    C.phase = 'fly';
    showBall(true);
    moveBall(0);
    draw();
    clearIn();
  }

  function showBall(on) {
    var b = A.el('base-ball');
    if (b) b.classList.toggle('on', !!on);
  }

  /** 공을 날린다 — 공격이면 마운드에서 홈으로, 수비면 하늘에서 글러브로 */
  function moveBall(p) {
    var b = A.el('base-ball');
    if (!b) return;
    var x, y, sc;
    if (C.top) {
      // 투수의 손(53, 29) 에서 홈플레이트(50, 78) 로
      x = 53 - 3 * p + Math.sin(p * 5) * 1.4;
      y = 29 + 49 * (p * p * 0.6 + p * 0.4);
      sc = 0.58 + 0.55 * p;
    } else {
      // 하늘에서 글러브 위(손가락 끝)로 떨어진다 — 46%,34% 가 글러브 포켓 자리다
      x = C.lane + (46 - C.lane) * p;
      y = -8 + 42 * p;
      sc = 0.5 + 0.6 * p;
    }
    b.style.left = x + '%';
    b.style.top = y + '%';
    b.style.setProperty('--sc', sc.toFixed(3));
  }

  function clearIn() {
    var el = A.el('gamein');
    if (el) el.value = '';
    if (G) G.wasBad = false;
  }

  /* =========================================================
     매 프레임
     ========================================================= */
  function step(dt) {
    if (!C || !G || G.over) return;

    if (C.phase === 'init') { half(true); return; }

    if (C.phase === 'wait') {
      C.wait -= dt;
      if (C.wait <= 0) afterWait();
      return;
    }

    if (C.phase !== 'fly') return;

    C.t += dt;
    var p = C.t / C.fly;
    if (p > 1) p = 1;
    moveBall(p);
    mirrorInput();

    // 규칙 3 — 오답을 쓰면 스트라이크 (한/영 키가 영문 상태면 봐준다)
    if (C.ball && !C.ball.dead) {
      var v = A.el('gamein').value;
      if (v) {
        var j = HG.judge(C.ball.word, v);
        if (!j.ok && !j.engMode) { wrongInput(); return; }
      }
    }

    if (p >= 1) timeUp();
  }

  /** 입력창에 친 글자를 기획서의 입력 상자에도 보여 준다 */
  function mirrorInput() {
    var v = A.el('gamein').value;
    var box = A.el(C.top ? 'base-inbox-a' : 'base-inbox-d');
    if (!box) return;
    if (v) box.innerHTML = '<b>' + A.esc(v) + '</b>';
    else box.innerHTML = '<span class="ph">' + (C.top ? '단어를 입력하세요' : '단어를 쓰시오') + '</span>';
  }

  /* ---------- 오답 (규칙 3) ---------- */
  function wrongInput() {
    clearIn();
    if (C.top) strike('오답! 스트라이크');
    else concede('오답! 못 잡았어요');
  }

  /* ---------- 시간 초과 (규칙 3·5) ---------- */
  function timeUp() {
    if (C.top) strike('못 쳤어요! 스트라이크');
    else concede('공을 놓쳤어요!');
  }

  /* =========================================================
     공격 — 규칙 3·4
     ========================================================= */
  function strike(why) {
    endBall();
    A.breakCombo();
    C.strikes++;
    showBoard();
    if (C.strikes >= STRIKES) {
      banner('삼진 아웃', why + ' · 스트라이크 ' + STRIKES + '개', 'out');
      A.flashItem({ icon: '✖', name: '삼진 아웃!', color: '#ff6b81' });
      addOut();
    } else {
      banner('스트라이크 ' + C.strikes, why + (C.fly < 4 ? ' (빠른 공이었어요)' : ''), 'strike');
      wait(1.0);
    }
  }

  /** 낱말을 다 쳤을 때 — 공격이면 안타 판정, 수비면 아웃 판정 */
  function hit(item) {
    if (!C || !C.ball || item !== C.ball || C.phase !== 'fly') return;
    endBall();
    A.addScore(item.word);
    if (C.top) swing(item);
    else defOut(item);
  }

  /* 규칙 4 — 난이도에 따라 안타·2루타·3루타, 홈런은 1/20 */
  function swing(item) {
    var kind, bases, name, icon, color;
    if (Math.random() < HOMER) {
      kind = 'hr'; bases = 4; name = '홈런!'; icon = '💥'; color = '#ffd166';
      A.bump(100);
    } else {
      var mix = HITMIX[C.diff] || HITMIX.normal;
      var r = Math.random() * (mix[0] + mix[1] + mix[2]);
      if (r < mix[0]) { kind = 'h1'; bases = 1; name = '안타!'; }
      else if (r < mix[0] + mix[1]) { kind = 'h2'; bases = 2; name = '2루타!'; }
      else { kind = 'h3'; bases = 3; name = '3루타!'; }
      icon = '⚾'; color = '#6ee7a0';
    }
    var got = advance(bases, true);
    C.strikes = 0;
    showBoard();
    banner(name, got > 0 ? (got + '점을 냈어요!') : ('“' + item.word + '” 를 쳤어요'),
      kind === 'hr' ? 'hr' : 'hit');
    A.flashItem({ icon: icon, name: name + (got ? ' +' + got + '점' : ''), color: color });
    swingBat();
    endPa(kind === 'hr' ? 1.9 : 1.35);
  }

  function swingBat() {
    var w = C.wrap;
    if (!w) return;
    w.classList.add('swing');
    setTimeout(function () { if (C.wrap) C.wrap.classList.remove('swing'); }, 520);
  }

  /* =========================================================
     수비 — 규칙 5
     ========================================================= */
  /* 맞히면 아웃 또는 fly out */
  function defOut(item) {
    var fly = Math.random() < 0.5;
    banner(fly ? 'fly out!' : '아웃!',
      fly ? '뜬공을 글러브로 잡았어요' : '“' + item.word + '” 를 잡아 아웃',
      'out');
    A.flashItem({ icon: '🧤', name: fly ? 'fly out! 잡았어요' : '아웃! 잘 잡았어요', color: '#6ee7a0' });
    catchPop();
    addOut();
  }

  /* 못 쓰면 상대가 안타·2루타·3루타 */
  function concede(why) {
    endBall();
    A.breakCombo();
    var mix = CPUMIX[C.diff] || CPUMIX.normal;
    var r = Math.random() * (mix[0] + mix[1] + mix[2]);
    var bases = r < mix[0] ? 1 : (r < mix[0] + mix[1] ? 2 : 3);
    var name = bases === 1 ? '상대 안타' : (bases === 2 ? '상대 2루타' : '상대 3루타');
    var got = advance(bases, false);
    showBoard();
    banner(name, why + (got ? ' · ' + got + '점을 줬어요' : ''), 'bad');
    A.flashItem({ icon: '😣', name: name + (got ? ' -' + got + '점' : ''), color: '#ff6b81' });
    endPa(1.35);
  }

  function catchPop() {
    var g = A.el('base-glove');
    if (!g) return;
    g.classList.add('pop');
    setTimeout(function () { if (g) g.classList.remove('pop'); }, 480);
  }

  /* =========================================================
     주자 · 득점 · 아웃 (야구 규칙 그대로)
     ========================================================= */
  function advance(n, mine) {
    var got = 0, i;
    if (n >= 4) {
      for (i = 0; i < 3; i++) { if (C.bases[i]) got++; C.bases[i] = false; }
      got++;                                  // 타자까지 홈인
    } else {
      for (i = 2; i >= 0; i--) {
        if (!C.bases[i]) continue;
        C.bases[i] = false;
        var to = i + n;
        if (to >= 3) got++;
        else C.bases[to] = true;
      }
      C.bases[n - 1] = true;                  // 타자가 밟은 베이스
    }
    if (mine) C.run.me += got; else C.run.cpu += got;
    return got;
  }

  function addOut() {
    endBall();
    C.outs++;
    C.outsDone++;
    C.strikes = 0;
    showBoard();
    A.progress(C.outsDone / (INNINGS * 2 * OUTS));
    endPa(1.4);
  }

  /** 한 타석이 끝났다 — 아웃 3개거나 타석 6번을 채웠으면 공수 교대 */
  function endPa(sec) {
    C.pa++;
    C.strikes = 0;
    showBoard();
    if (C.outs >= OUTS || C.pa >= MAX_PA) wait(sec + 0.2, 'half');
    else wait(sec);
  }

  function endBall() {
    if (C.ball) C.ball.dead = true;
    C.ball = null;
    G.items = [];
    C.phase = 'anim';
    showBall(false);
    clearIn();
    mirrorInput();
  }

  function wait(sec, next) {
    C.phase = 'wait';
    C.wait = sec;
    C.next = next || 'pitch';
  }
  function afterWait() {
    hideBanner();
    if (C.next === 'half') half(false);
    else pitch();
  }

  /* =========================================================
     이닝 (초 = 우리 공격 / 말 = 우리 수비)
     ========================================================= */
  function half(first) {
    if (!first) {
      if (C.top) { C.top = false; }
      else { C.top = true; C.inning++; }
    }
    C.outs = 0; C.strikes = 0; C.pa = 0;
    C.bases = [false, false, false];

    // 경기 끝났는지
    if (C.inning > INNINGS) {
      if (C.run.me !== C.run.cpu) { finish(); return; }
      if (C.inning > MAX_INNINGS) { finish(); return; }      // 무승부
    }

    C.wrap.classList.toggle('attack', C.top);
    C.wrap.classList.toggle('defense', !C.top);
    showBoard();

    var t = C.inning + '회' + (C.top ? '초' : '말');
    var s = C.top ? '우리 ' + TEAM[C.mine].name + ' 공격' : '우리 ' + TEAM[C.mine].name + ' 수비';
    halfTitle(t, s, C.inning > INNINGS ? '연장전' : '');
    C.phase = 'wait';
    C.wait = 1.7;
    C.next = 'pitch';
  }

  function halfTitle(t, s, extra) {
    var el = A.el('base-half');
    if (!el) return;
    el.innerHTML = '<b>' + A.esc(t) + '</b><span>' + A.esc(s) + '</span>' +
      (extra ? '<em>' + A.esc(extra) + '</em>' : '');
    el.className = 'base-half on';
    setTimeout(function () {
      var e = A.el('base-half');
      if (e) e.className = 'base-half';
    }, 1500);
  }

  function finish() {
    var me = C.run.me, you = C.run.cpu;
    var msg;
    if (me > you) msg = '🏆 ' + TEAM[C.mine].name + ' 승리! ' + me + ' : ' + you;
    else if (me < you) msg = '😢 ' + TEAM[C.cpu].name + ' 에게 졌어요 ' + me + ' : ' + you;
    else msg = '🤝 무승부 ' + me + ' : ' + you;
    A.progress(1);
    A.gameOver(msg, me > you);
  }

  /* =========================================================
     스코어보드 · 배너
     ========================================================= */
  function showBoard() {
    var w = C.run[C.mine === 'white' ? 'me' : 'cpu'];
    var b = C.run[C.mine === 'blue' ? 'me' : 'cpu'];
    txt('base-bd-white', w);
    txt('base-bd-blue', b);
    txt('base-sb-me', C.run.me);
    txt('base-sb-you', C.run.cpu);
    txt('base-inn-no', C.inning);
    txt('base-inn-ar', C.top ? '▲' : '▼');
    txt('base-pa', '타석 ' + Math.min(MAX_PA, C.pa + 1) + '/' + MAX_PA);

    var i;
    for (i = 1; i <= 3; i++) {
      cls('base-d' + i, 'on', C.bases[i - 1]);
      cls('base-o' + i, 'on', C.outs >= i);
      cls('base-s' + i, 'on', C.strikes >= i);
    }
    var bd = C.wrap.querySelector('.base-board');
    if (bd) {
      bd.classList.toggle('mine-white', C.mine === 'white');
      bd.classList.toggle('mine-blue', C.mine === 'blue');
    }
    // 그라운드 위의 주자
    for (i = 1; i <= 3; i++) cls('base-r' + i, 'on', C.bases[i - 1]);
  }
  function txt(id, v) { var e = A.el(id); if (e) e.textContent = v; }
  function cls(id, c, on) { var e = A.el(id); if (e) e.classList.toggle(c, !!on); }

  function banner(big, sub, kind) {
    var el = A.el('base-banner');
    if (!el) return;
    el.innerHTML = '<b>' + A.esc(big) + '</b><span>' + A.esc(sub) + '</span>';
    el.className = 'base-banner on ' + kind;
  }
  function hideBanner() {
    var el = A.el('base-banner');
    if (el) el.className = 'base-banner';
  }

  /* ---------- 낱말 표시 갱신 ---------- */
  function draw() {
    if (!C || !C.ball) return;
    C.ball.wEl.innerHTML = A.wordHtml(C.ball);
    var b = A.el('base-ball');
    if (b) b.classList.toggle('lock', !!C.ball.lock);
  }

  GAMES.register('base', {
    name: '야구게임', credit: '해산물 연합팀', icon: '⚾',
    desc: '청팀과 백팀으로 나뉘어 야구를 해요. 공에 적힌 낱말을 치면 안타, 못 치면 스트라이크! 홈런은 스무 번에 한 번.',
    pdf: 'game_vibe/20260818105044.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
