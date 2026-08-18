/* g-zoo.js — 탈출하는 동물을 잡아라! (기획 · 동물의 왕국)
   game_vibe/20260818104957.pdf 의 규칙과 그림을 그대로 옮겼다.

   규칙(원문) 1~6 을 그대로 옮긴 자리
     1. 토끼·거북이·미어캣 +10 / 코끼리·기린·코뿔소 50 /
        호랑이·사자 70 / 유니콘 +100                        → KINDS[].pt, hit()
     2. 동물을 놓치면 -50포인트, 제한시간 2분 30초           → MISS_PT, TIME
     3. 하이에나는 함정 -30포인트,
        10초마다 랜덤으로 동물 한 마리가 달아나며 -10포인트  → HYENA_PT, autoFlee()
     4. 등장 가중치 75 / 50 / 25 / 15                        → KINDS[].w
     5. 쉬움 기본자리 · 보통 왼손 윗줄 · 어려움 전체 실전,
        점점 동물의 속도가 빨라진다                          → DIFFS, ramp
     6. 안 틀리고 연속 5번 잡으면 보너스 +10포인트           → STREAK_N, STREAK_PT

   그림(3·4쪽)을 옮긴 자리
     · 왼쪽에 터진 빨간 울타리          → FENCE_SVG
     · 낱말 팻말을 든 동물 10종         → ANIMAL_SVG, .zoo-sign
     · 오른쪽 끝에 올가미를 든 사육사   → KEEPER_SVG
     · 오른쪽 위 남은 시간 / 포인트     → .zoo-hud
     · 거북이 등딱지에 제목 + PLAY      → introHtml()
     · 게임 끝! · 포인트 상자 ·
       다시하기 · 다음단계 · 난이도 3종 → showEnd()
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var TIME = 150;          // 규칙 2 — 제한시간 2분 30초
  var MISS_PT = -50;       // 규칙 2 — 동물을 놓치면
  var HYENA_PT = -30;      // 규칙 3 — 하이에나 함정
  var FLEE_EVERY = 10;     // 규칙 3 — 10초마다
  var FLEE_PT = -10;       // 규칙 3 — 그때 -10포인트
  var STREAK_N = 5;        // 규칙 6 — 연속 5번
  var STREAK_PT = 10;      // 규칙 6 — 보너스 +10

  /* ---------- 화면 값 ---------- */
  var LANES = [26, 41, 56, 71, 86];   // 세로 줄 5개 (팻말이 겹치지 않게 넓게 벌렸다)
  var START_X = 13;                   // 울타리 터진 자리
  var GOAL_X = 80;                    // 사육사 앞 — 여기까지 가면 놓친다
  /* 속도 · 등장 간격 · 화면에 동시에 있는 동물 수는 기획서에 없다. 여기서 난이도를 맞췄다.
     놓치면 -50 이 커서, 자판을 막 배운 아이가 낱말 하나에 15초씩 걸려도
     "쉬움"에서는 놓치는 일이 거의 없도록 잡았다(한 마리가 화면을 건너는 시간을 길게).
       쉬움  — 건너는 데 처음 42초 → 마지막 27초, 6.2초마다 1마리, 화면에 최대 3마리
       보통  — 처음 33초 → 마지막 22초, 5.6초마다, 최대 4마리
       어려움 — 처음 25초 → 마지막 16초, 4.4초마다, 최대 5마리
     한 타에 2.5초(24타/분) 걸리는 아이로 돌려 보면 쉬움은 120~360점, 어려움은 0점이 나온다. */
  var BASE_SPD = 2.0;                 // %/초 (규칙 5 — 시간이 갈수록 빨라진다)
  var RAMP = 0.55;                    // 마지막에 1.55배

  /* =========================================================
     동물 10종 — 아이 그림처럼 단순한 선과 점 눈
     (모두 오른쪽을 보고 달린다. viewBox 0 0 120 100, 발끝 y≈94)
     ========================================================= */
  var ANIMAL_SVG = {
    /* 토끼 +10 */
    rabbit:
      '<path d="M38 72 h12 v22 h-12 z" fill="#f3ece2"/>' +
      '<path d="M56 74 h12 v20 h-12 z" fill="#f3ece2"/>' +
      '<path d="M74 72 h13 v22 h-13 z" fill="#f3ece2"/>' +
      '<circle cx="24" cy="60" r="9" fill="#fffaf3"/>' +
      '<ellipse cx="56" cy="62" rx="30" ry="20" fill="#fdf6ee"/>' +
      '<path d="M78 34 C72 16 76 6 83 8 C90 10 88 26 84 40 Z" fill="#fdf6ee"/>' +
      '<path d="M92 34 C93 16 99 8 104 12 C109 16 102 30 97 41 Z" fill="#fdf6ee"/>' +
      '<ellipse cx="90" cy="53" rx="17" ry="15" fill="#fdf6ee"/>' +
      '<circle cx="98" cy="49" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<path d="M104 58 C107 60 108 62 106 64" fill="none" stroke-width="2.4"/>',

    /* 거북이 +10 */
    turtle:
      '<path d="M30 70 h15 v20 h-15 z" fill="#e6d4a4"/>' +
      '<path d="M72 70 h15 v20 h-15 z" fill="#e6d4a4"/>' +
      '<path d="M88 52 h16 v20 h-16 z" fill="#e6d4a4"/>' +
      '<ellipse cx="106" cy="50" rx="14" ry="11" fill="#e6d4a4"/>' +
      '<circle cx="112" cy="46" r="2.6" fill="#2b211a" stroke="none"/>' +
      '<path d="M22 66 C22 44 42 32 62 32 C84 32 100 46 100 68 Z" fill="#a9d162"/>' +
      '<path d="M18 64 h84 v12 h-84 z" fill="#e6d4a4"/>' +
      '<path d="M40 64 C42 48 52 38 62 36 M62 36 C74 42 82 50 86 64 M28 52 h68" fill="none" stroke-width="2.6"/>',

    /* 미어캣 +10 */
    meerkat:
      '<path d="M46 88 C30 86 24 72 30 58" fill="none" stroke-width="6"/>' +
      '<path d="M50 92 C42 72 44 46 60 40 C76 34 84 52 79 74 C76 88 72 93 66 93 Z" fill="#d9b482"/>' +
      '<path d="M58 90 C53 72 56 56 64 52 C72 50 75 64 73 78 C71 88 66 91 62 91 Z" fill="#f2e0c4"/>' +
      '<path d="M74 54 C84 56 87 66 84 74" fill="none" stroke-width="5"/>' +
      '<circle cx="59" cy="24" r="6" fill="#b9895c"/>' +
      '<ellipse cx="70" cy="33" rx="15" ry="13" fill="#d9b482"/>' +
      '<path d="M82 32 C93 30 97 36 91 42 C86 45 82 39 82 32 Z" fill="#f2e0c4"/>' +
      '<ellipse cx="78" cy="28" rx="4" ry="4" fill="#2b211a" stroke="none"/>' +
      '<circle cx="92" cy="36" r="2.4" fill="#2b211a" stroke="none"/>' +
      '<path d="M50 93 h20" fill="none" stroke-width="5"/>',

    /* 코끼리 50 */
    elephant:
      '<path d="M28 62 h15 v32 h-15 z" fill="#b3bdca"/>' +
      '<path d="M50 66 h15 v28 h-15 z" fill="#b3bdca"/>' +
      '<path d="M70 66 h15 v28 h-15 z" fill="#b3bdca"/>' +
      '<path d="M16 46 C6 44 4 56 10 62" fill="none" stroke-width="4"/>' +
      '<ellipse cx="54" cy="52" rx="36" ry="26" fill="#c9d3de"/>' +
      '<ellipse cx="90" cy="52" rx="20" ry="19" fill="#c9d3de"/>' +
      '<path d="M84 34 C67 32 63 57 78 63 C88 67 92 50 90 38 Z" fill="#b3bdca"/>' +
      '<path d="M100 58 C114 62 116 80 106 92 C101 96 95 92 99 85 C104 77 104 70 93 67 Z" fill="#c9d3de"/>' +
      '<path d="M99 71 C105 73 107 77 107 81" fill="none" stroke="#f4efe2" stroke-width="4"/>' +
      '<circle cx="97" cy="46" r="2.8" fill="#2b211a" stroke="none"/>',

    /* 기린 50 */
    giraffe:
      '<path d="M32 68 h11 v26 h-11 z" fill="#eebd5f"/>' +
      '<path d="M50 70 h11 v24 h-11 z" fill="#eebd5f"/>' +
      '<path d="M64 68 h11 v26 h-11 z" fill="#eebd5f"/>' +
      '<path d="M20 50 C10 50 8 62 14 68" fill="none" stroke-width="4"/>' +
      '<ellipse cx="48" cy="60" rx="29" ry="19" fill="#f4c96f"/>' +
      '<path d="M64 56 L76 16 L93 20 L79 62 Z" fill="#f4c96f"/>' +
      '<path d="M74 18 L64 52" fill="none" stroke="#c1852c" stroke-width="6"/>' +
      '<ellipse cx="95" cy="18" rx="16" ry="10" fill="#f4c96f"/>' +
      '<path d="M86 9 L84 2 M94 8 L94 1" fill="none" stroke-width="4"/>' +
      '<circle cx="84" cy="2" r="3.4" fill="#c1852c"/>' +
      '<circle cx="94" cy="1.6" r="3.4" fill="#c1852c"/>' +
      '<ellipse cx="40" cy="52" rx="6" ry="5" fill="#c1852c" stroke="none"/>' +
      '<ellipse cx="56" cy="58" rx="6" ry="5" fill="#c1852c" stroke="none"/>' +
      '<ellipse cx="47" cy="68" rx="5" ry="4" fill="#c1852c" stroke="none"/>' +
      '<ellipse cx="66" cy="55" rx="4" ry="4" fill="#c1852c" stroke="none"/>' +
      '<circle cx="99" cy="15" r="2.6" fill="#2b211a" stroke="none"/>' +
      '<path d="M104 22 h6" fill="none" stroke-width="2.4"/>',

    /* 코뿔소 50 */
    rhino:
      '<path d="M26 66 h15 v28 h-15 z" fill="#a7adb6"/>' +
      '<path d="M48 68 h15 v26 h-15 z" fill="#a7adb6"/>' +
      '<path d="M68 68 h15 v26 h-15 z" fill="#a7adb6"/>' +
      '<path d="M16 48 C6 46 4 58 10 64" fill="none" stroke-width="4"/>' +
      '<ellipse cx="48" cy="56" rx="34" ry="23" fill="#b8bec7"/>' +
      '<path d="M74 42 C92 38 108 46 110 58 C112 70 98 76 84 72 C74 69 70 54 74 42 Z" fill="#b8bec7"/>' +
      '<path d="M104 46 C107 32 113 28 115 33 C117 39 110 45 108 53 Z" fill="#f2ecdc"/>' +
      '<path d="M96 54 C98 47 101 45 103 48 C104 51 100 54 99 58 Z" fill="#f2ecdc"/>' +
      '<ellipse cx="80" cy="38" rx="6" ry="8" fill="#a7adb6"/>' +
      '<circle cx="93" cy="52" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<path d="M100 66 h8" fill="none" stroke-width="2.6"/>',

    /* 호랑이 70 */
    tiger:
      '<path d="M32 70 h13 v24 h-13 z" fill="#f0983c"/>' +
      '<path d="M52 72 h13 v22 h-13 z" fill="#f0983c"/>' +
      '<path d="M70 70 h13 v24 h-13 z" fill="#f0983c"/>' +
      '<path d="M22 60 C8 54 10 34 24 30" fill="none" stroke="#f5a94f" stroke-width="8"/>' +
      '<path d="M22 60 C8 54 10 34 24 30" fill="none" stroke-width="3" stroke-dasharray="7 8"/>' +
      '<ellipse cx="52" cy="62" rx="31" ry="19" fill="#f5a94f"/>' +
      '<path d="M42 48 L40 76 M55 46 L54 78 M68 48 L69 76" fill="none" stroke="#5a3a1e" stroke-width="4"/>' +
      '<path d="M80 40 L78 28 L90 34 Z" fill="#f5a94f"/>' +
      '<path d="M100 38 L104 27 L108 39 Z" fill="#f5a94f"/>' +
      '<circle cx="93" cy="52" r="18" fill="#f5a94f"/>' +
      '<ellipse cx="100" cy="60" rx="11" ry="8" fill="#fff3e2"/>' +
      '<path d="M84 40 L82 48 M92 38 L92 46" fill="none" stroke="#5a3a1e" stroke-width="3.4"/>' +
      '<circle cx="90" cy="50" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<circle cx="102" cy="49" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<path d="M97 56 l5 3 -5 3 z" fill="#5a3a1e" stroke="none"/>' +
      '<path d="M99 62 C102 66 106 66 108 63" fill="none" stroke-width="2.6"/>',

    /* 사자 70 */
    lion:
      '<path d="M30 70 h13 v24 h-13 z" fill="#e8ac5c"/>' +
      '<path d="M50 72 h13 v22 h-13 z" fill="#e8ac5c"/>' +
      '<path d="M66 70 h13 v24 h-13 z" fill="#e8ac5c"/>' +
      '<path d="M20 58 C8 52 8 36 18 32" fill="none" stroke-width="5"/>' +
      '<circle cx="16" cy="30" r="8" fill="#c9822c"/>' +
      '<ellipse cx="48" cy="62" rx="30" ry="19" fill="#f0b96e"/>' +
      '<path d="M92 26 L98 34 L107 30 L106 40 L115 46 L106 52 L108 62 L98 60 L93 70 L86 62 L76 64 L78 54 L70 46 L79 39 L78 29 L88 32 Z" fill="#d98b34"/>' +
      '<circle cx="92" cy="47" r="16" fill="#f6cf8f"/>' +
      '<ellipse cx="96" cy="55" rx="10" ry="7" fill="#fff3e2"/>' +
      '<circle cx="88" cy="44" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<circle cx="99" cy="43" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<path d="M94 51 l4 3 -4 3 z" fill="#8a5a20" stroke="none"/>' +
      '<path d="M96 57 C99 61 103 60 104 57" fill="none" stroke-width="2.6"/>',

    /* 유니콘 +100 */
    unicorn:
      '<path d="M30 68 h12 v26 h-12 z" fill="#fdf5ff"/>' +
      '<path d="M48 70 h12 v24 h-12 z" fill="#fdf5ff"/>' +
      '<path d="M64 68 h12 v26 h-12 z" fill="#fdf5ff"/>' +
      '<path d="M20 50 C8 54 6 72 16 80" fill="none" stroke="#c9a7ff" stroke-width="8"/>' +
      '<ellipse cx="48" cy="58" rx="30" ry="19" fill="#fdf5ff"/>' +
      '<path d="M66 50 L82 22 L96 30 L80 60 Z" fill="#fdf5ff"/>' +
      '<path d="M84 18 C98 14 110 22 109 31 C108 38 94 40 85 35 Z" fill="#fdf5ff"/>' +
      '<path d="M91 16 L95 2 L100 17 Z" fill="#ffd873"/>' +
      '<path d="M82 16 C72 24 70 40 74 52" fill="none" stroke="#c9a7ff" stroke-width="7"/>' +
      '<circle cx="97" cy="25" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<path d="M105 32 h5" fill="none" stroke-width="2.4"/>',

    /* 하이에나 -30 (함정) */
    hyena:
      '<path d="M30 72 h12 v22 h-12 z" fill="#b99c72"/>' +
      '<path d="M50 74 h12 v20 h-12 z" fill="#b99c72"/>' +
      '<path d="M68 72 h12 v22 h-12 z" fill="#b99c72"/>' +
      '<path d="M22 62 C10 58 10 44 20 40" fill="none" stroke-width="7"/>' +
      '<path d="M24 74 C22 56 38 44 58 44 C78 44 90 52 94 62 C97 70 93 78 88 78 L30 78 C26 78 24 77 24 74 Z" fill="#cbb28c"/>' +
      '<path d="M40 44 L44 32 L51 44 L57 30 L64 42 L72 33 L76 45" fill="none" stroke="#6b563a" stroke-width="5"/>' +
      '<ellipse cx="42" cy="58" rx="5" ry="4" fill="#6b563a" stroke="none"/>' +
      '<ellipse cx="58" cy="64" rx="5" ry="4" fill="#6b563a" stroke="none"/>' +
      '<ellipse cx="72" cy="58" rx="4" ry="3.4" fill="#6b563a" stroke="none"/>' +
      '<ellipse cx="90" cy="42" rx="7" ry="9" fill="#a98d66"/>' +
      '<path d="M86 48 C102 44 114 50 114 59 C114 68 100 72 86 67 Z" fill="#cbb28c"/>' +
      '<circle cx="98" cy="54" r="2.8" fill="#2b211a" stroke="none"/>' +
      '<path d="M100 63 C104 66 109 65 111 62" fill="none" stroke-width="2.6"/>'
  };

  /* 규칙 1·4 — 점수와 등장 가중치 (기획서 그대로).
     하이에나 가중치만 기획서에 없어 30 으로 정했다 (전체의 약 6%). */
  var KINDS = [
    { id: 'rabbit', name: '토끼', pt: 10, w: 75, sp: 1.15, color: '#f6efe6' },
    { id: 'turtle', name: '거북이', pt: 10, w: 75, sp: 0.72, color: '#a9d162' },
    { id: 'meerkat', name: '미어캣', pt: 10, w: 75, sp: 1.10, color: '#d9b482' },
    { id: 'elephant', name: '코끼리', pt: 50, w: 50, sp: 0.82, color: '#c9d3de' },
    { id: 'giraffe', name: '기린', pt: 50, w: 50, sp: 0.92, color: '#f4c96f' },
    { id: 'rhino', name: '코뿔소', pt: 50, w: 50, sp: 0.96, color: '#b8bec7' },
    { id: 'tiger', name: '호랑이', pt: 70, w: 25, sp: 1.18, color: '#f5a94f' },
    { id: 'lion', name: '사자', pt: 70, w: 25, sp: 1.12, color: '#f0b96e' },
    { id: 'unicorn', name: '유니콘', pt: 100, w: 15, sp: 1.30, color: '#c9a7ff' },
    { id: 'hyena', name: '하이에나', pt: HYENA_PT, w: 30, sp: 1.05, color: '#cbb28c', trap: true }
  ];
  var KMAP = {};
  var WSUM = 0;
  (function () {
    for (var i = 0; i < KINDS.length; i++) { KMAP[KINDS[i].id] = KINDS[i]; WSUM += KINDS[i].w; }
  })();

  /* 규칙 5 — 난이도 3종. 낱말 자리표는 기획서 그대로,
     spd·spawn·alive 는 기획서에 없어 위 주석대로 정한 값이다 */
  var DIFFS = [
    { id: 'easy', name: '쉬움', hint: '기본자리', lv: 1, maxKeys: 6, spd: 0.75, spawn: 6.2, alive: 3 },
    { id: 'normal', name: '보통', hint: '왼손 윗줄', lv: 2, maxKeys: 8, spd: 0.95, spawn: 5.6, alive: 4 },
    { id: 'hard', name: '어려움', hint: '전체 실전', lv: 0, maxKeys: 11, spd: 1.25, spawn: 4.4, alive: 5 }
  ];
  var diffIdx = 0;        // 다시 하기 · 다음 단계에서 이어지도록 파일 전역에 둔다

  /* 왼쪽에 터진 빨간 울타리 (기획서 3쪽) — 가운데가 뚫려 동물이 그리로 나온다 */
  var FENCE_SVG =
    '<svg class="zoo-fence" viewBox="0 0 150 620" aria-hidden="true">' +
    '  <path d="M30 8 C88 74 124 154 120 258 L98 258 C102 162 66 90 8 26 Z" fill="#c25a3f" stroke="#8e3b26" stroke-width="4" stroke-linejoin="round"/>' +
    '  <path d="M18 44 L45 21 M43 79 L71 56 M72 133 L100 114 M90 193 L118 179 M94 253 L123 247" fill="none" stroke="#8e3b26" stroke-width="4"/>' +
    '  <path d="M104 236 L132 256 L118 302 L92 282 Z" fill="#c25a3f" stroke="#8e3b26" stroke-width="4" stroke-linejoin="round"/>' +
    '  <path d="M108 330 L136 312 L124 358 L98 372 Z" fill="#c25a3f" stroke="#8e3b26" stroke-width="4" stroke-linejoin="round"/>' +
    '  <path d="M120 372 C116 462 78 546 24 612 L4 598 C58 530 94 452 98 372 Z" fill="#c25a3f" stroke="#8e3b26" stroke-width="4" stroke-linejoin="round"/>' +
    '  <path d="M94 380 L123 387 M88 415 L117 428 M71 470 L99 492 M44 525 L71 550 M16 570 L42 590" fill="none" stroke="#8e3b26" stroke-width="4"/>' +
    '  <path d="M126 288 l14 -10 M132 316 l16 4" fill="none" stroke="#8e3b26" stroke-width="3"/>' +
    '</svg>';

  /* 오른쪽 끝 올가미를 든 사육사 (기획서 3쪽) */
  var KEEPER_SVG =
    '<svg class="zoo-keeper" viewBox="0 0 130 300" aria-hidden="true">' +
    '  <path d="M40 150 C34 200 36 228 40 240 L92 240 C96 228 98 200 92 150 Z" fill="#eef3f8" stroke="#3a2c22" stroke-width="4" stroke-linejoin="round"/>' +
    '  <path d="M46 240 v40 M86 240 v40" fill="none" stroke="#3a2c22" stroke-width="5"/>' +
    '  <path d="M32 278 h28 v14 h-28 z M74 278 h28 v14 h-28 z" fill="#f6efe2" stroke="#3a2c22" stroke-width="4" stroke-linejoin="round"/>' +
    '  <circle cx="66" cy="120" r="26" fill="#fdf6ee" stroke="#3a2c22" stroke-width="4"/>' +
    '  <path d="M28 112 h76 M28 132 h76" fill="none" stroke="#3a2c22" stroke-width="3.6"/>' +
    '  <path d="M60 100 h12 v122 h-12 z" fill="#f6efe2" stroke="#3a2c22" stroke-width="4"/>' +
    '  <circle cx="66" cy="92" r="9" fill="#3a2c22"/>' +
    '  <path d="M66 86 C66 54 108 48 108 28 C108 10 82 10 82 28 C82 42 100 42 100 30"' +
    '        fill="none" stroke="#3a2c22" stroke-width="5" stroke-linecap="round"/>' +
    '</svg>';

  /* 인트로 — 거북이 등딱지에 제목이 적혀 있다 (기획서 4쪽) */
  var TURTLE_TITLE_SVG =
    '<svg class="zoo-bigturtle" viewBox="0 0 440 250" aria-hidden="true">' +
    '  <path d="M96 168 h30 v58 h-30 z" fill="#e6d4a4" stroke="#3a2c22" stroke-width="5" stroke-linejoin="round"/>' +
    '  <path d="M232 168 h30 v58 h-30 z" fill="#e6d4a4" stroke="#3a2c22" stroke-width="5" stroke-linejoin="round"/>' +
    '  <path d="M300 96 h44 v72 h-44 z" fill="#e6d4a4" stroke="#3a2c22" stroke-width="5" stroke-linejoin="round"/>' +
    '  <ellipse cx="358" cy="82" rx="56" ry="42" fill="#e6d4a4" stroke="#3a2c22" stroke-width="5"/>' +
    '  <circle cx="388" cy="66" r="5" fill="#3a2c22"/>' +
    '  <path d="M392 96 C400 100 404 104 400 108" fill="none" stroke="#3a2c22" stroke-width="4"/>' +
    '  <path d="M46 168 C46 78 118 26 190 26 C264 26 322 82 322 168 Z" fill="#cfe0a6" stroke="#3a2c22" stroke-width="6" stroke-linejoin="round"/>' +
    '  <path d="M34 166 h300 v22 h-300 z" rx="10" fill="#e6d4a4" stroke="#3a2c22" stroke-width="5" stroke-linejoin="round"/>' +
    '  <text class="zoo-tt" x="184" y="98" transform="rotate(-6 184 98)">탈출하는 동물을</text>' +
    '  <text class="zoo-tt" x="176" y="146" transform="rotate(-6 176 146)">잡아라!</text>' +
    '</svg>';

  var G, Z;

  function kindSvg(id) {
    return '<svg class="zoo-draw" viewBox="0 0 120 100" aria-hidden="true">' + ANIMAL_SVG[id] + '</svg>';
  }

  /* =========================================================
     인트로 (엔터 → 3·2·1 → 시작)
     ========================================================= */
  function introHtml() {
    var chips = '';
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      chips += '<span class="zoo-chip' + (k.trap ? ' trap' : '') + '">' +
        '<i>' + kindSvg(k.id) + '</i>' +
        '<b>' + k.name + '</b>' +
        '<u>' + (k.pt > 0 ? '+' + k.pt : k.pt) + '점</u></span>';
    }
    var diffs = '';
    for (var d = 0; d < DIFFS.length; d++) {
      diffs += '<button type="button" class="zoo-dchip' + (d === diffIdx ? ' sel' : '') +
        '" data-d="' + d + '">' + DIFFS[d].name + '<small>' + DIFFS[d].hint + '</small></button>';
    }
    return '<div class="zoo-introbg"></div>' +
      '<div class="zoo-intro">' +
      '  <div class="zoo-introleft">' +
      TURTLE_TITLE_SVG +
      '    <div class="zoo-play">PLAY</div>' +
      '    <p class="zoo-introgo">엔터를 누르면 시작해요</p>' +
      '  </div>' +
      '  <div class="zoo-introright">' +
      '    <p class="zoo-introby">학생이 만든 게임 · 기획 동물의 왕국</p>' +
      '    <p class="zoo-introdesc">동물들이 우리를 탈출했어요!<br>' +
      '      동물이 든 <b>팻말의 낱말</b>을 치면 올가미로 잡습니다.</p>' +
      '    <div class="zoo-chiprow">' + chips + '</div>' +
      '    <p class="zoo-introhint">놓치면 -50점 · 하이에나는 함정 -30점 · 제한시간 2분 30초<br>' +
      '      10초마다 한 마리가 저절로 달아나요(-10점) · 안 틀리고 연속 5번 잡으면 +10점</p>' +
      '    <div class="zoo-diffrow"><span>난이도</span>' + diffs + '</div>' +
      '  </div>' +
      '</div>';
  }

  /** 인트로의 난이도 단추 — 눌러도 인트로가 닫히지 않게 막는다 */
  function bindIntroDiff() {
    var st = A.stage();
    var box = st.querySelector('.zoo-diffrow');
    if (!box) return;
    var bs = box.querySelectorAll('.zoo-dchip');
    var pick = function (e) {
      e.stopPropagation();
      diffIdx = parseInt(this.getAttribute('data-d'), 10) || 0;
      for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('sel', i === diffIdx);
      showDiff();
    };
    for (var i = 0; i < bs.length; i++) bs[i].onclick = pick;
  }

  /* =========================================================
     시작 — 울타리·사육사·줄(레인)을 그린다
     ========================================================= */
  function start() {
    A.prepare('zoo', introHtml());
    G = A.state();

    var st = A.stage();
    var room = document.createElement('div');
    room.className = 'zoo-room';
    room.innerHTML =
      '<div class="zoo-sky"></div>' +
      '<div class="zoo-ground"></div>' +
      FENCE_SVG +
      '<div class="zoo-keeperbox">' + KEEPER_SVG + '</div>' +
      '<div class="zoo-field" id="zoo-field"></div>' +
      '<div class="zoo-hud">' +
      '  <span class="zoo-time">남은 시간: <b id="zoo-sec">' + TIME + '</b>초</span>' +
      '  <span class="zoo-ptbox">포인트: <b id="zoo-pt">0</b>점</span>' +
      '</div>' +
      '<div class="zoo-sub">' +
      '  <span class="zoo-diffbadge" id="zoo-diff">쉬움 · 기본자리</span>' +
      '  <span class="zoo-streak" id="zoo-streak">연속 0 / ' + STREAK_N + '</span>' +
      '</div>';
    st.appendChild(room);

    Z = {
      list: [], lanes: [null, null, null, null, null],
      spawnAcc: 2.6, fleeAcc: 0, streak: 0, lastErr: 0,
      caught: 0, missed: 0, fled: 0, over: false, used: [], secShown: -1
    };
    G.zoo = Z;
    G.items = [];

    showDiff();
    showStreak();
    bindIntroDiff();
    spawn();
  }

  function showDiff() {
    var e = A.el('zoo-diff');
    if (e) e.textContent = DIFFS[diffIdx].name + ' · ' + DIFFS[diffIdx].hint;
  }
  function showStreak() {
    var e = A.el('zoo-streak');
    if (e) e.textContent = '연속 ' + Z.streak + ' / ' + STREAK_N;
  }
  function showPt() {
    var e = A.el('zoo-pt');
    if (e) e.textContent = G.score;
  }

  /* ---------- 규칙 5 — 난이도별 낱말 ---------- */
  function pickWord() {
    var d = DIFFS[diffIdx];
    var pool = d.lv ? (DATA.WORD_UPTO[d.lv] || []) : DATA.WORDS;
    if (!pool || pool.length < 10) pool = DATA.WORDS;
    var fit = pool.filter(function (w) {
      var n = A.keyLen(w);
      return n >= 2 && n <= d.maxKeys;
    });
    if (fit.length > 15) pool = fit;

    var live = Z.list.filter(function (it) { return !it.dead; })
      .map(function (it) { return it.word; });
    for (var t = 0; t < 40; t++) {
      var w = pool[Math.floor(Math.random() * pool.length)];
      if (live.indexOf(w) < 0 && Z.used.indexOf(w) < 0) {
        Z.used.push(w);
        if (Z.used.length > 18) Z.used.shift();
        return w;
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- 규칙 4 — 가중치로 동물을 뽑는다 ---------- */
  function pickKind() {
    var r = Math.random() * WSUM;
    for (var i = 0; i < KINDS.length; i++) {
      r -= KINDS[i].w;
      if (r <= 0) return KINDS[i];
    }
    return KINDS[0];
  }

  /* ---------- 동물 한 마리를 우리 밖으로 ---------- */
  function spawn() {
    var free = [];
    for (var i = 0; i < LANES.length; i++) if (!Z.lanes[i]) free.push(i);
    if (!free.length) return;
    var lane = free[Math.floor(Math.random() * free.length)];

    var k = pickKind();
    var word = pickWord();

    var el = document.createElement('div');
    el.className = 'zoo-an' + (k.trap ? ' trap' : '');
    el.style.left = START_X + '%';
    el.style.top = LANES[lane] + '%';
    // 아래 줄일수록 앞에 그린다 — 윗줄 동물 몸에 아랫줄 팻말이 가리지 않게
    el.style.zIndex = 10 + lane;
    el.innerHTML =
      '<span class="zoo-sign"><span class="zoo-w"></span></span>' +
      '<span class="zoo-body">' + kindSvg(k.id) + '</span>';
    A.el('zoo-field').appendChild(el);

    var n = A.keyLen(word);
    var it = {
      word: word, el: el, wEl: el.querySelector('.zoo-w'),
      lock: false, matched: 0, dead: false,
      kind: k.id, lane: lane, x: START_X,
      sp: k.sp, sf: Math.max(0.55, Math.min(1.15, 6 / (n + 1.2)))
    };
    it.wEl.textContent = word;
    Z.lanes[lane] = it;
    Z.list.push(it);
    G.items.push(it);
  }

  /* =========================================================
     매 프레임 — 이동 · 제한시간 · 10초 규칙 · 속도 상승
     ========================================================= */
  function step(dt) {
    if (!Z || Z.over) return;

    var left = TIME - G.elapsed;
    if (left < 0) left = 0;
    if (left > TIME) left = TIME;
    var sec = Math.ceil(left);
    if (sec !== Z.secShown) {
      Z.secShown = sec;
      var se = A.el('zoo-sec');
      if (se) se.textContent = sec;
      var hud = A.stage().querySelector('.zoo-hud');
      if (hud) hud.classList.toggle('hot', sec <= 20);
    }
    A.progress(left / TIME);
    if (left <= 0) { finish(); return; }

    // 규칙 6 — 오타를 내면 연속이 끊긴다
    if (G.errors > Z.lastErr) { Z.lastErr = G.errors; Z.streak = 0; showStreak(); }

    // 규칙 5 — 점점 빨라진다
    var ramp = 1 + Math.min(G.elapsed / TIME, 1) * RAMP;

    var alive = 0;
    for (var i = 0; i < Z.list.length; i++) if (!Z.list[i].dead) alive++;

    var d = DIFFS[diffIdx];
    Z.spawnAcc += dt;
    var interval = Math.max(d.spawn * 0.62, d.spawn / ramp);
    if (Z.spawnAcc >= interval) {
      Z.spawnAcc = 0;
      if (alive < d.alive) spawn();
    }

    // 규칙 3 — 10초마다 한 마리가 저절로 달아난다 (-10점)
    Z.fleeAcc += dt;
    if (Z.fleeAcc >= FLEE_EVERY) { Z.fleeAcc -= FLEE_EVERY; autoFlee(); }

    for (var j = 0; j < Z.list.length; j++) {
      var it = Z.list[j];
      if (it.dead) continue;
      it.x += BASE_SPD * d.spd * ramp * it.sp * it.sf * dt;
      if (it.x >= GOAL_X) { escaped(it); continue; }
      it.el.style.left = it.x + '%';
    }
    draw();
  }

  /* ---------- 규칙 1·3 — 낱말을 다 쳤을 때 ---------- */
  function hit(item) {
    if (!Z || Z.over || item.dead) return;
    var k = KMAP[item.kind];
    item.dead = true;
    G.items = G.items.filter(function (x) { return x !== item; });
    Z.lanes[item.lane] = null;
    G.keys += A.keyLen(item.word);

    lasso(item);

    if (k.trap) {
      // 규칙 3 — 하이에나는 함정
      A.bump(HYENA_PT);
      A.breakCombo();
      Z.streak = 0;
      showStreak();
      shake();
      item.el.classList.add('bad');
      A.flashItem({ icon: '🚫', name: '하이에나는 함정! ' + HYENA_PT + '포인트', color: '#ff6b81' });
    } else {
      // 규칙 1 — 동물마다 정해진 점수
      A.bump(k.pt);
      Z.caught++;
      G.combo++;
      if (G.combo > G.bestCombo) G.bestCombo = G.combo;
      A.el('g-combo').textContent = G.combo;
      item.el.classList.add('caught');
      A.flashItem({ icon: '🎯', name: k.name + '을 잡았어요! +' + k.pt, color: k.color });

      // 규칙 6 — 안 틀리고 연속 5번
      Z.streak++;
      if (Z.streak >= STREAK_N) {
        Z.streak = 0;
        A.bump(STREAK_PT);
        setTimeout(function () {
          A.flashItem({ icon: '⭐', name: '연속 ' + STREAK_N + '번! 보너스 +' + STREAK_PT, color: '#ffd166' });
        }, 420);
      }
      showStreak();
    }
    showPt();
    removeSoon(item, 620);
  }

  /* ---------- 규칙 2 — 동물을 놓치면 -50 ---------- */
  function escaped(it) {
    it.dead = true;
    G.items = G.items.filter(function (x) { return x !== it; });
    Z.lanes[it.lane] = null;

    /* 하이에나는 "잡으면 안 되는" 함정이다(규칙 3). 안 잡고 보낸 걸
       "동물을 놓쳤다"(규칙 2) 로 세어 -50 을 물리면 규칙끼리 어긋난다.
       그래서 하이에나가 지나가는 건 점수를 건드리지 않는다. */
    if (KMAP[it.kind].trap) {
      it.el.classList.add('gone');
      removeSoon(it, 700);
      return;
    }

    Z.missed++;
    A.bump(MISS_PT);
    A.breakCombo();
    Z.streak = 0;
    showStreak();
    showPt();
    shake();
    it.el.classList.add('gone');
    A.flashItem({ icon: '💨', name: KMAP[it.kind].name + '을 놓쳤어요! ' + MISS_PT + '포인트', color: '#ff8fab' });
    removeSoon(it, 700);
  }

  /* ---------- 규칙 3 — 10초마다 한 마리가 저절로 달아난다 ---------- */
  function autoFlee() {
    // 지금 치고 있는 동물(lock)은 빼 준다 — 다 쳐 가는데 뺏기면 아이가 억울해한다
    var live = Z.list.filter(function (it) { return !it.dead && !it.lock && !KMAP[it.kind].trap; });
    if (!live.length) return;                    // 잡을 동물이 없으면 그냥 넘어간다
    var it = live[Math.floor(Math.random() * live.length)];
    it.dead = true;
    G.items = G.items.filter(function (x) { return x !== it; });
    Z.lanes[it.lane] = null;
    Z.fled++;
    A.bump(FLEE_PT);
    showPt();
    it.el.classList.add('gone');
    A.flashItem({ icon: '⏱', name: '10초마다 한 마리가 달아나요 — ' + KMAP[it.kind].name + ' ' + FLEE_PT, color: '#9ec5ff' });
    removeSoon(it, 700);
  }

  function removeSoon(it, ms) {
    setTimeout(function () {
      if (it.el && it.el.parentNode) it.el.remove();
      if (Z) Z.list = Z.list.filter(function (x) { return x !== it; });
    }, ms);
  }

  /** 사육사가 올가미를 던진다 */
  function lasso(it) {
    var field = A.el('zoo-field');
    if (!field) return;
    var rope = document.createElement('div');
    rope.className = 'zoo-rope';
    rope.style.left = '94%';
    rope.style.top = LANES[it.lane] + '%';
    field.appendChild(rope);
    var x = it.x;
    setTimeout(function () {
      rope.style.left = x + '%';
      rope.classList.add('fly');
    }, 20);
    setTimeout(function () { if (rope.parentNode) rope.remove(); }, 620);
  }

  function shake() {
    var st = A.stage();
    st.classList.add('zoo-shake');
    setTimeout(function () { st.classList.remove('zoo-shake'); }, 430);
  }

  /* ---------- 낱말 표시 갱신 ---------- */
  function draw() {
    if (!Z) return;
    for (var i = 0; i < Z.list.length; i++) {
      var it = Z.list[i];
      if (it.dead) continue;
      it.wEl.innerHTML = A.wordHtml(it);
      it.el.classList.toggle('lock', !!it.lock);
    }
  }

  /* =========================================================
     끝 화면 (기획서 4쪽 오른쪽) —
     "게임 끝!" · 포인트 상자 · 다시하기 · 다음단계 · 난이도 3종
     ========================================================= */
  function finish() {
    Z.over = true;
    var win = Z.caught > Z.missed;
    var pts = G.score;
    A.gameOver('🦁 게임 끝! 잡은 동물 ' + Z.caught + '마리 · 놓친 동물 ' + Z.missed + '마리', win);
    showEnd(pts);
  }

  function showEnd(pts) {
    var st = A.stage();
    var ov = document.createElement('div');
    ov.className = 'zoo-end';

    var diffs = '';
    for (var d = 0; d < DIFFS.length; d++) {
      diffs += '<button type="button" class="zoo-dchip big' + (d === diffIdx ? ' sel' : '') +
        '" data-d="' + d + '">' + DIFFS[d].name + '<small>' + DIFFS[d].hint + '</small>' +
        (d === diffIdx ? '<em>현재</em>' : '') + '</button>';
    }

    ov.innerHTML =
      '<div class="zoo-endbox">' +
      '  <h2 class="zoo-endtitle">게임 끝!</h2>' +
      '  <div class="zoo-endpt">포인트: <b>' + pts + '</b>점</div>' +
      '  <p class="zoo-endsub">잡은 동물 ' + Z.caught + '마리 · 놓친 동물 ' + Z.missed +
      '마리 · 저절로 달아난 동물 ' + Z.fled + '마리</p>' +
      '  <div class="zoo-endbtns">' +
      '    <button type="button" class="zoo-ebtn" id="zoo-again">다시하기</button>' +
      '    <button type="button" class="zoo-ebtn next" id="zoo-next">다음단계</button>' +
      '  </div>' +
      '  <div class="zoo-enddiff">' + diffs + '</div>' +
      '  <button type="button" class="zoo-ghost" id="zoo-rec">기록 보기</button>' +
      '</div>';
    st.appendChild(ov);

    A.el('zoo-again').onclick = function () { start(); };
    A.el('zoo-next').onclick = function () {
      diffIdx = Math.min(DIFFS.length - 1, diffIdx + 1);
      start();
    };
    A.el('zoo-rec').onclick = function () { ov.remove(); };

    var bs = ov.querySelectorAll('.zoo-dchip');
    for (var i = 0; i < bs.length; i++) {
      bs[i].onclick = function () {
        diffIdx = parseInt(this.getAttribute('data-d'), 10) || 0;
        var all = ov.querySelectorAll('.zoo-dchip');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('sel', j === diffIdx);
        setTimeout(function () { start(); }, 220);
      };
    }
  }

  GAMES.register('zoo', {
    name: '탈출하는 동물을 잡아라!', credit: '동물의 왕국', icon: '🦁',
    desc: '동물이 우리를 탈출했어요! 동물이 든 팻말의 낱말을 치면 잡습니다. 유니콘은 100점, 하이에나는 함정!',
    pdf: 'game_vibe/20260818104957.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
