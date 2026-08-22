/* =========================================================
   village.js — 내 마을: 타자 포인트로 마을이 자라난다
   반 로그인(cloud) 학생 전용.

   시즌제 — 3개월(3~5월 / 6~8월 / 9~11월 / 12~2월)마다 마을이 새로 시작한다.
   헤비유저가 2주 만에 마을을 다 채우고 할 일이 없어지는 걸 막기 위해서다.
   리셋되는 것은 시즌 포인트와 마을뿐이고, 평생 누적 포인트·레벨·게임 특전은
   그대로 남는다. 지난 시즌 마을은 탭에서 계속 볼 수 있다.

   장(챕터) — 한 시즌은 5장. 장마다 배경이 바뀌고, 뒤로 갈수록 목표가 멀어진다.
   그림은 village-art*.js 의 VILLAGE_ART / VILLAGE_BG 를 쓴다.
   ========================================================= */
var VILLAGE = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* =========================================================
     시즌 — 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울
     12월은 그 해 겨울, 이듬해 1~2월도 같은 겨울 시즌으로 이어진다.
     ========================================================= */
  var SEASON_NAME = ['봄', '여름', '가을', '겨울'];

  /** 지금 한국시간 */
  function kstNow() {
    return new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
  }
  /* 시즌제를 시작한 날. 이날부터 9월 1일 사이(여름 시즌 끄트머리)에 들어온
     학생을 여름 시즌으로 묶으면, 마을을 받자마자 9월 1일에 초기화된다.
     그래서 이 구간은 가을 시즌으로 당겨 붙인다 — 첫 시즌만 조금 길다. */
  var FIRST_SEASON_UNTIL = new Date(2026, 8, 1);   // 2026-09-01

  /** 그 날짜가 속한 시즌 — { key, label, year, idx } */
  function seasonOf(d) {
    d = d || kstNow();
    var m = d.getMonth() + 1, y = d.getFullYear(), idx;
    if (d < FIRST_SEASON_UNTIL) { idx = 2; y = 2026; }   // 첫 시즌 — 2026 가을
    else if (m >= 3 && m <= 5) idx = 0;
    else if (m >= 6 && m <= 8) idx = 1;
    else if (m >= 9 && m <= 11) idx = 2;
    else { idx = 3; if (m <= 2) y -= 1; }     // 1~2월은 지난해 12월에 시작한 겨울
    return { key: y + '-' + SEASON_NAME[idx], label: y + ' ' + SEASON_NAME[idx] + ' 시즌', year: y, idx: idx };
  }
  /** 이번 시즌이 끝나는 날 (한국시간 기준) */
  function seasonEnd(s) {
    s = s || seasonOf();
    var endMonth = [6, 9, 12, 3][s.idx];             // 다음 시즌 시작 달
    var endYear = s.idx === 3 ? s.year + 1 : s.year;
    return new Date(endYear, endMonth - 1, 1);
  }
  function daysLeft() {
    var ms = seasonEnd() - kstNow();
    return Math.max(0, Math.ceil(ms / 86400000));
  }
  /** '2026-가을' 같은 시즌 키에서 계절 번호를 꺼낸다 (지난 시즌 다시 볼 때) */
  function seasonIdxOfKey(key) {
    var i = SEASON_NAME.indexOf(String(key).split('-')[1]);
    return i < 0 ? 0 : i;
  }

  /* =========================================================
     장(챕터) — 5장. p 는 그 시즌에 모은 포인트 기준.
     ========================================================= */
  var CHAPTERS = [
    {
      id: 'town', no: 1, name: '우리 동네', icon: '🏘️', from: 0, to: 800,
      items: [
        { p: 0, key: 'house1', name: '작은 오두막', l: 6, b: 26, w: 12 },
        { p: 30, key: 'tree1', name: '둥근 나무', l: 15, b: 24, w: 8.5 },
        { p: 60, key: 'flower', name: '꽃밭', l: 62, b: 8, w: 8 },
        { p: 100, key: 'rabbit', name: '토끼', l: 36, b: 6, w: 6.5 },
        { p: 150, key: 'house2', name: '아담한 집', l: 37, b: 26, w: 13 },
        { p: 210, key: 'tree2', name: '전나무', l: 49.5, b: 24.5, w: 8 },
        { p: 270, key: 'bird', name: '파랑새', l: 68, b: 9, w: 5 },
        { p: 340, key: 'shop', name: '가게', l: 58, b: 26, w: 11 },
        { p: 420, key: 'cat', name: '고양이', l: 18, b: 5, w: 6.5 },
        { p: 500, key: 'fountain', name: '분수대', l: 44, b: 3, w: 12 },
        { p: 590, key: 'dog', name: '강아지', l: 55, b: 5, w: 6.5 },
        { p: 690, key: 'house3', name: '2층집', l: 72, b: 25, w: 13.5 },
        { p: 800, key: 'school', name: '학교', l: 86, b: 25, w: 12 }
      ]
    },
    {
      id: 'sea', no: 2, name: '바닷가', icon: '🏖️', from: 800, to: 1800,
      items: [
        { p: 880, key: 'shell', name: '조개', l: 24, b: 5, w: 6 },
        { p: 960, key: 'palm', name: '야자수', l: 7, b: 18, w: 12 },
        { p: 1050, key: 'parasol', name: '파라솔', l: 34, b: 16, w: 12 },
        { p: 1150, key: 'gull', f: 1, name: '갈매기', l: 66, b: 60, w: 7 },
        { p: 1260, key: 'sandcastle', name: '모래성', l: 52, b: 6, w: 11 },
        { p: 1380, key: 'crab', name: '게', l: 15, b: 4, w: 7 },
        { p: 1500, key: 'boat', f: 1, name: '나룻배', l: 68, b: 32, w: 14 },
        { p: 1620, key: 'dolphin', f: 1, name: '돌고래', l: 44, b: 36, w: 12 },
        { p: 1720, key: 'surfshop', name: '해변 가게', l: 22, b: 18, w: 13 },
        { p: 1800, key: 'lighthouse', name: '등대', l: 85, b: 20, w: 12 }
      ]
    },
    {
      id: 'forest', no: 3, name: '숲속', icon: '🌲', from: 1800, to: 3000,
      items: [
        { p: 1900, key: 'mushroom', name: '버섯집', l: 10, b: 10, w: 11 },
        { p: 2000, key: 'squirrel', name: '다람쥐', l: 8, b: 3, w: 6 },
        { p: 2110, key: 'stream', name: '시냇물', l: 38, b: 2, w: 26 },
        { p: 2230, key: 'fox', name: '여우', l: 68, b: 6, w: 8 },
        { p: 2360, key: 'owl', f: 1, name: '부엉이', l: 50, b: 38, w: 7 },
        { p: 2500, key: 'bridge', name: '나무다리', l: 36, b: 5, w: 22 },
        { p: 2650, key: 'deer', name: '사슴', l: 79, b: 8, w: 11 },
        { p: 2790, key: 'campfire', name: '모닥불', l: 22, b: 4, w: 9 },
        { p: 2900, key: 'treehouse', name: '나무 위 집', l: 62, b: 24, w: 17 },
        { p: 3000, key: 'waterfall', name: '폭포', l: 2, b: 24, w: 15 }
      ]
    },
    {
      id: 'sky', no: 4, name: '하늘마을', icon: '☁️', from: 3000, to: 4500,
      items: [
        { p: 3130, key: 'star', f: 1, name: '반짝별', l: 30, b: 62, w: 6 },
        { p: 3260, key: 'kite', f: 1, name: '연', l: 12, b: 52, w: 9 },
        { p: 3400, key: 'balloon', f: 1, name: '열기구', l: 68, b: 44, w: 13 },
        { p: 3550, key: 'cloudhouse', f: 1, name: '구름집', l: 20, b: 20, w: 16 },
        { p: 3710, key: 'rainbow', f: 1, name: '무지개', l: 34, b: 24, w: 26 },
        { p: 3880, key: 'windmill', f: 1, name: '바람개비 풍차', l: 64, b: 16, w: 13 },
        { p: 4060, key: 'moon', f: 1, name: '초승달', l: 85, b: 58, w: 10 },
        { p: 4230, key: 'airship', f: 1, name: '비행선', l: 4, b: 34, w: 20 },
        { p: 4370, key: 'planet', f: 1, name: '작은 행성', l: 50, b: 52, w: 11 },
        { p: 4500, key: 'skycastle', f: 1, name: '하늘 성', l: 78, b: 6, w: 20 }
      ]
    },
    {
      id: 'winter', no: 5, name: '겨울마을', icon: '⛄', from: 4500, to: 6300,
      items: [
        { p: 4650, key: 'snowman', name: '눈사람', l: 34, b: 5, w: 9 },
        { p: 4810, key: 'snowtree', name: '눈 덮인 나무', l: 13, b: 22, w: 11 },
        { p: 4980, key: 'penguin', name: '펭귄', l: 46, b: 4, w: 7 },
        { p: 5160, key: 'igloo', name: '이글루', l: 60, b: 22, w: 15 },
        { p: 5350, key: 'sled', name: '썰매', l: 17, b: 4, w: 12 },
        { p: 5550, key: 'reindeer', name: '순록', l: 76, b: 5, w: 11 },
        { p: 5760, key: 'bonfire', name: '화톳불', l: 55, b: 5, w: 9 },
        { p: 5980, key: 'polarbear', name: '북극곰', l: 5, b: 4, w: 12 },
        { p: 6150, key: 'xmastree', name: '크리스마스 트리', l: 40, b: 20, w: 13 },
        { p: 6300, key: 'lodge', name: '산장', l: 84, b: 22, w: 15 }
      ]
    }
  ];

  /** 모든 아이템을 한 줄로 (포인트 순) */
  var ALL = CHAPTERS.reduce(function (a, c) { return a.concat(c.items); }, []);
  var LAST_P = ALL[ALL.length - 1].p;

  function chapterOfPoint(p) {
    for (var i = CHAPTERS.length - 1; i >= 0; i--) if (p >= CHAPTERS[i].from) return CHAPTERS[i];
    return CHAPTERS[0];
  }
  function chapterUnlocked(ch, p) { return p >= ch.from; }

  /* =========================================================
     세션 / 시즌 데이터
     c.season = { key, sp, vg:{ 아이템키: {at, p, lv, by} } }
     c.past   = { 시즌키: { sp, vg, label } }
     ========================================================= */
  function sess() { return APP.rec.cloud || null; }

  /** 지금 시즌 주머니를 꺼낸다. 시즌이 바뀌었으면 넘겨 두고 새로 시작한다. */
  function season() {
    var c = sess();
    if (!c) return null;
    var now = seasonOf();

    /* 시즌제가 없던 시절부터 하던 학생 — 마을이 평생 누적 포인트로 자랐다.
       그대로 0으로 되돌리면 다 지어 놓은 마을을 빼앗는 셈이라,
       지금까지 모은 포인트를 이번 시즌 시작값으로 그대로 넘겨받는다.
       다음 시즌부터는 정상적으로 0에서 시작한다. */
    if (!c.season) {
      c.season = {
        key: now.key, label: now.label,
        sp: c.points || 0, vg: {}, carried: (c.points || 0) > 0
      };
      APP.save();
    } else if (c.season.key !== now.key) {
      if ((c.season.sp || 0) > 0) {
        if (!c.past) c.past = {};
        c.past[c.season.key] = {
          sp: c.season.sp || 0, vg: c.season.vg || {},
          label: c.season.label || c.season.key
        };
      }
      c.season = { key: now.key, label: now.label, sp: 0, vg: {} };
      APP.save();
    }
    if (!c.season.vg) c.season.vg = {};
    return c.season;
  }
  /** 이번 시즌에 모은 포인트 */
  function points() {
    var s = season();
    return s ? (s.sp || 0) : 0;
  }

  function unlocked(p) {
    return ALL.filter(function (m) { return p >= m.p; });
  }
  function nextOne(p) {
    for (var i = 0; i < ALL.length; i++) if (p < ALL[i].p) return ALL[i];
    return null;
  }

  /* =========================================================
     보고 있는 화면 상태
     ========================================================= */
  var view = { chapter: null, past: null };   // past 가 있으면 지난 시즌 보기
  var justKey = null;                          // 방금 새로 열린 것 — 등장 연출용

  /** 지금 화면에 그릴 데이터 { sp, vg, label, live } */
  function viewData() {
    var c = sess();
    if (view.past && c && c.past && c.past[view.past]) {
      var o = c.past[view.past];
      return { sp: o.sp || 0, vg: o.vg || {}, label: o.label || view.past, live: false };
    }
    var s = season();
    return { sp: s ? (s.sp || 0) : 0, vg: s ? s.vg : {}, label: s ? s.label : '', live: true };
  }

  function capOn() { return !!APP.rec.vgCap; }

  /* =========================================================
     화면
     ========================================================= */
  function open() {
    view.past = null;
    view.chapter = null;
    render();
    APP.show('village');
    // 처음 온 학생에게는 무엇을 하는 곳인지 한 번 알려 준다
    if (!APP.rec.vgHelpSeen) setTimeout(openHelp, 500);
  }

  function render() {
    var c = sess();
    if (!c) return;
    var d = viewData();
    var p = d.sp;

    // 보고 있는 장 — 정하지 않았으면 지금 열려 있는 마지막 장
    var cur = chapterOfPoint(p);
    if (view.chapter == null) view.chapter = cur.no;
    var ch = CHAPTERS[view.chapter - 1];
    if (!chapterUnlocked(ch, p)) { ch = cur; view.chapter = cur.no; }

    renderTabs(p, d);
    renderStat(c, d);
    renderScene(ch, p, d);
    renderFoot(ch, p, d);
  }

  /* ---------- 위쪽 장 탭 ---------- */
  function renderTabs(p, d) {
    var box = $('vg-tabs');
    if (!box) return;
    box.innerHTML = '';
    CHAPTERS.forEach(function (ch) {
      var on = chapterUnlocked(ch, p);
      var done = p >= ch.to;
      /* 아직 안 열린 장은 이름을 감춘다 — 무엇이 나올지 모르는 편이 더 궁금하다 */
      var b = document.createElement('button');
      b.className = 'vg-tab' + (ch.no === view.chapter ? ' sel' : '') + (on ? '' : ' lock');
      b.innerHTML = '<span class="i">' + (on ? ch.icon : '🔒') + '</span>'
        + '<span class="n">' + ch.no + '장</span>'
        + '<span class="t">' + (on ? ch.name : '???') + '</span>'
        + (done ? '<span class="b">🏅</span>' : '');
      b.title = on ? ch.name : (ch.from + 'P를 모으면 열려요 (지금 ' + p + 'P)');
      b.onclick = function () {
        if (!on) {
          APP.toast('🔒 ' + ch.no + '장은 ' + ch.from + 'P를 모으면 열려요. '
            + (ch.from - p) + 'P 남았어요 — 무엇이 나올지는 그때 알 수 있어요!');
          return;
        }
        view.chapter = ch.no;
        render();
      };
      box.appendChild(b);
    });

    // 지난 시즌 고르기
    var sel = $('vg-season');
    if (!sel) return;
    var c = sess();
    var keys = c && c.past ? Object.keys(c.past).sort().reverse() : [];
    sel.hidden = !keys.length;
    if (!keys.length) return;
    sel.innerHTML = '<option value="">' + (season() ? season().label : '이번 시즌') + ' (지금)</option>'
      + keys.map(function (k) {
        return '<option value="' + k + '">' + (c.past[k].label || k) + ' 다시 보기</option>';
      }).join('');
    sel.value = view.past || '';
    sel.onchange = function () {
      view.past = sel.value || null;
      view.chapter = null;
      render();
    };
  }

  /* ---------- 오른쪽 위 상태 ---------- */
  function renderStat(c, d) {
    var el = $('vg-stat');
    if (!el) return;
    if (!d.live) {
      el.className = 'foot-note';
      el.textContent = '🗓 ' + d.label + ' 다시 보기 · ' + d.sp + 'P (그때 모은 점수)';
      return;
    }
    /* 시즌이 끝나면 마을이 새로 시작한다. 아무 예고 없이 사라지면
       아이가 자기 마을을 빼앗겼다고 느끼므로 일주일 전부터 눈에 띄게 알린다. */
    var left = daysLeft();
    el.className = 'foot-note' + (left <= 7 ? ' vg-soon' : '');
    el.textContent = c.nick + ' · ' + d.label + ' ' + d.sp + 'P'
      + ' · 시즌 끝까지 ' + left + '일'
      + (left <= 7 ? ' — 그다음엔 새 마을을 짓게 돼요 (지금 마을은 다시 볼 수 있어요)' : '')
      + '   (평생 ' + (c.points || 0) + 'P · Lv.' + (c.level || 1) + ')';
  }

  /* ---------- 마을 장면 ---------- */
  function renderScene(ch, p, d) {
    var scene = $('vg-scene');
    if (!scene) return;
    /* 장에 따라 배경이, 시즌에 따라 빛깔이 바뀐다.
       같은 마을을 다시 지어도 시즌이 다르면 다르게 보이라고 넣었다. */
    var se = ['spring', 'summer', 'autumn', 'winter'][
      (view.past ? seasonIdxOfKey(view.past) : seasonOf().idx)
    ];
    scene.className = 'vg-scene bg-' + ch.id + ' se-' + se;

    var bg = (window.VILLAGE_BG && VILLAGE_BG[ch.id]) || {};
    var html = '';

    /* 특별한 날이면 마을 기본 하늘 장식을 어떻게 할지 그날이 정한다.
       안 그러면 크리스마스 밤에 웃는 해가 달 옆에 그대로 떠 있게 된다.
         'none'   해도 구름도 뺀다 (밤)
         'clouds' 구름만 남긴다 (그날이 제 해를 갖고 있을 때)
         그 밖    마을 것 그대로 */
    var hol = (window.HOLIDAY && d.live) ? HOLIDAY.of(fakeDay) : null;
    var keepSky = hol ? (hol.defaultSky || 'all') : 'all';
    (bg.sky || []).forEach(function (s) {
      if (keepSky === 'none') return;
      if (keepSky === 'clouds' && s.key === 'sun') return;
      html += item(s.key, s, null, 'vg-sky');
    });
    if (bg.hill) html += '<div class="vg-item vg-sky" style="left:0;bottom:0;width:100%;height:56%">' + bg.hill + '</div>';
    if (bg.path) html += '<div class="vg-item vg-sky" style="left:0;bottom:0;width:100%">' + bg.path + '</div>';

    ch.items.forEach(function (m) {
      if (p < m.p) return;
      var cls = m.key === justKey ? 'pop' : '';
      if (m.f) cls += ' vg-sky';        // 공중에 뜬 것 — 접지 그림자를 그리지 않는다
      html += item(m.key, m, m.name, cls, d.vg[m.key]);
    });
    justKey = null;
    scene.innerHTML = html;
    // 특별한 날이면 하늘을 갈아끼운다 (지난 시즌을 볼 때는 그대로 둔다)
    if (window.HOLIDAY && d.live) todayHoliday = HOLIDAY.apply(scene, fakeDay);
    else todayHoliday = null;
    bindTips(scene);
  }

  var todayHoliday = null;
  /* 특별한 날 배경을 미리 볼 때 쓴다 — 주소에 ?day=10-09 를 붙이면 그날인 셈 친다.
     교사가 "크리스마스엔 어떻게 되나요" 하고 물으면 보여 줄 수 있다. */
  var fakeDay = (function () {
    var m = /[?&]day=(\d{2})-(\d{2})/.exec(location.search);
    if (!m) return null;
    var y = new Date().getFullYear();
    return new Date(y, +m[1] - 1, +m[2]);
  })();

  function item(key, s, title, cls, rec) {
    var pos = s.t != null ? 'top:' + s.t + '%;' : 'bottom:' + s.b + '%;';
    var cap = title && capOn()
      ? '<span class="vg-cap">' + esc(title) + '</span>' : '';
    return '<div class="vg-item' + (cls ? ' ' + cls : '') + '" style="left:' + s.l + '%;'
      + pos + 'width:' + s.w + '%"'
      + (title ? ' data-name="' + esc(title) + '" data-tip="' + esc(tipText(title, s, rec)) + '"' : '')
      + '>' + (VILLAGE_ART[key] || fallback(key)) + cap + '</div>';
  }

  /** 그림이 아직 없는 아이템 — 이름만이라도 보이게 */
  function fallback(key) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="50" cy="55" r="38" fill="#cdeafe" opacity="0.55"/>'
      + '<text x="50" y="70" font-size="46" text-anchor="middle">🏗️</text></svg>';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 조사 붙이기 — "바닷가를", "학교를", "등대를" 처럼 받침에 맞춰 고른다 */
  function josa(word, withJong, noJong) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c < 0xac00 || c > 0xd7a3) return word + noJong;      // 한글이 아니면 받침 없는 쪽
    return word + ((c - 0xac00) % 28 ? withJong : noJong);
  }

  /* ---------- 이 아이콘이 왜 생겼는지 ---------- */
  var DAY = ['일', '월', '화', '수', '목', '금', '토'];
  function tipText(name, s, rec) {
    var line = name + ' · ' + s.p + 'P 달성';
    if (!rec || !rec.at) return line + '\n언제 받았는지 기록이 없어요 (기록을 남기기 전에 받은 것)';
    var d = new Date(rec.at);
    var when = (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + DAY[d.getDay()] + ') '
      + d.getHours() + '시 ' + d.getMinutes() + '분';
    var out = line + '\n' + when + ' · Lv.' + (rec.lv || 1) + ' 때 받았어요';
    if (rec.by) out += '\n' + josa(rec.by, '을', '를') + ' 하고 나서 생겼어요';
    return out;
  }

  /* 커스텀 툴팁 — 브라우저 기본 title 은 뜨는 데 1초 넘게 걸려서 아이가 못 기다린다 */
  var tipEl = null;
  function bindTips(scene) {
    scene.querySelectorAll('.vg-item[data-tip]').forEach(function (el) {
      el.onmouseenter = function () { showTip(el); };
      el.onmouseleave = hideTip;
      el.onclick = function () { showTip(el); };     // 터치 화면용
    });
  }
  function showTip(el) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'vg-tip';
      document.body.appendChild(tipEl);
    }
    tipEl.innerHTML = el.getAttribute('data-tip').split('\n')
      .map(function (t, i) { return '<span class="' + (i ? 'd' : 'h') + '">' + esc(t) + '</span>'; })
      .join('');
    tipEl.hidden = false;
    var r = el.getBoundingClientRect();
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    var y = r.top - h - 10;
    if (y < 8) y = r.bottom + 10;
    tipEl.style.left = Math.round(x) + 'px';
    tipEl.style.top = Math.round(y) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  /* ---------- 아래쪽 다음 목표 ---------- */
  function renderFoot(ch, p, d) {
    var nx = nextOne(p);
    var doneCh = p >= ch.to;
    var msg, ratio;

    if (!d.live) {
      var got = ch.items.filter(function (m) { return p >= m.p; }).length;
      msg = '🗓 ' + d.label + '에 지은 마을이에요. ' + ch.no + '장에서 ' + got + '/' + ch.items.length + '개를 모았어요.';
      ratio = got / ch.items.length;
    } else if (!nx) {
      msg = '🏆 다섯 장을 모두 완성했어요! 시즌이 끝날 때까지 이 마을은 그대로 남아요.';
      ratio = 1;
    } else if (doneCh) {
      var nc = chapterOfPoint(p);
      msg = '🏅 ' + ch.no + '장 「' + ch.name + '」 완성! 지금은 ' + nc.no + '장 「' + josa(nc.name, '」을', '」를') + ' 짓는 중이에요.';
      ratio = 1;
    } else {
      var prev = ch.from;
      ch.items.forEach(function (m) { if (m.p <= p && m.p > prev) prev = m.p; });
      ratio = nx.p > prev ? (p - prev) / (nx.p - prev) : 0;
      msg = '다음 목표: ' + nx.name + '까지 ' + (nx.p - p) + 'P 남음 — 연습하면 포인트가 쌓여요!';
    }
    $('vg-next').textContent = msg;
    $('vg-bar').style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';

    /* 오늘이 특별한 날이면 무슨 날인지 한 줄 알려 준다.
       하늘만 바꿔 놓으면 아이는 왜 달라졌는지 모른다. */
    var hb = $('vg-hday');
    if (!hb) return;
    if (todayHoliday) {
      hb.hidden = false;
      hb.innerHTML = '<span>' + todayHoliday.icon + '</span>'
        + '<span class="n">' + esc(todayHoliday.name) + '</span>'
        + '<span class="d">' + esc(todayHoliday.note) + '</span>';
    } else {
      hb.hidden = true;
    }
  }

  /* =========================================================
     포인트가 오를 때 (cloud.js 가 불러 준다)
     meta = { by: '낱말 방어전' } 처럼 무엇을 해서 받았는지
     ========================================================= */
  function onPoints(before, after, meta) {
    var s = season();
    if (!s) return;
    var c = sess();
    var fresh = ALL.filter(function (m) { return m.p > before && m.p <= after; });
    fresh.forEach(function (m) {
      s.vg[m.key] = {
        at: Date.now(), p: after, lv: c.level || 1,
        by: (meta && meta.by) || ''
      };
      var ch = CHAPTERS.filter(function (x) { return x.items.indexOf(m) >= 0; })[0];
      APP.toast('🏘️ ' + ch.no + '장에 「' + josa(m.name, '」이', '」가') + ' 생겼어요! 내 마을에서 확인해 보세요.');
      justKey = m.key;
      if (m.p === ch.to && ch.no < CHAPTERS.length) {
        var nx = CHAPTERS[ch.no];
        setTimeout(function () {
          APP.toast('🎊 ' + ch.no + '장 「' + ch.name + '」 완성! 이제 ' + nx.no + '장 「' + josa(nx.name, '」이', '」가') + ' 열렸어요.');
        }, 2600);
      }
    });
    APP.save();
    var sec = $('s-village');
    if (sec && sec.classList.contains('on')) render();
  }

  /** cloud.js 가 시즌 포인트를 더할 때 부른다 */
  function addPoints(p) {
    var s = season();
    if (!s) return 0;
    var before = s.sp || 0;
    s.sp = before + p;
    return before;
  }

  function updateButton() {
    var b = $('btn-village');
    if (b) b.hidden = !sess();
  }

  /* =========================================================
     리포트·대시보드가 쓰는 요약
     ========================================================= */
  /** 시즌 포인트로 만든 마을 요약 { sp, total, got, chapter, chapterName, done } */
  function summary(sp) {
    sp = sp || 0;
    var got = unlocked(sp).length;
    var ch = chapterOfPoint(sp);
    return {
      sp: sp, total: ALL.length, got: got,
      chapter: ch.no, chapterName: ch.name,
      done: got >= ALL.length,
      nextName: nextOne(sp) ? nextOne(sp).name : '',
      nextIn: nextOne(sp) ? nextOne(sp).p - sp : 0
    };
  }

  /* =========================================================
     도움말 — 마을이 무엇이고 포인트가 어떻게 붙는지
     처음 들어온 학생에게 한 번 저절로 뜬다.
     안 열린 장은 이름을 감춰 둔다 (무엇이 나올지 궁금하게).
     ========================================================= */
  function renderHelpChapters() {
    var box = $('vg-help-chs');
    if (!box) return;
    var p = points();
    box.innerHTML = CHAPTERS.map(function (ch) {
      var on = chapterUnlocked(ch, p);
      var done = p >= ch.to;
      var when = ch.from === 0 ? '처음부터'
        : on ? '열렸어요' : ch.from + 'P를 모으면';
      return '<div class="vg-help-ch' + (on ? '' : ' lock') + (done ? ' done' : '') + '">'
        + '<span class="i">' + (on ? ch.icon : '❓') + '</span>'
        + '<span class="n">' + ch.no + '장</span>'
        + '<span class="t">' + (on ? esc(ch.name) : '???') + '</span>'
        + '<span class="w">' + when + '</span>'
        + (done ? '<span class="m">🏅 완성</span>' : '')
        + '</div>';
    }).join('');
  }

  function openHelp() {
    renderHelpChapters();
    var m = $('vg-help');
    if (m) m.hidden = false;
  }
  function closeHelp() {
    var m = $('vg-help');
    if (m) m.hidden = true;
    APP.rec.vgHelpSeen = true;
    APP.save();
  }

  function init() {
    var b = $('btn-village');
    if (b) b.onclick = open;
    updateButton();
    var cap = $('btn-vg-cap');
    if (cap) {
      cap.classList.toggle('on', capOn());
      cap.onclick = function () {
        APP.rec.vgCap = !capOn();
        APP.save();
        cap.classList.toggle('on', capOn());
        render();
      };
    }
    var hb = $('btn-vg-help');
    if (hb) hb.onclick = openHelp;
    var ok = $('vg-help-ok');
    if (ok) ok.onclick = closeHelp;
    document.addEventListener('scroll', hideTip, true);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    open: open, render: render, onPoints: onPoints, addPoints: addPoints,
    updateButton: updateButton, summary: summary,
    /** 지금 시즌 주머니 — 리포트가 쓴다. 없으면 여기서 만들어 준다
        (시즌제 이전 학생이 마을을 한 번도 안 열었어도 제 값이 나오게) */
    season: season,
    seasonOf: seasonOf, seasonEnd: seasonEnd, daysLeft: daysLeft,
    CHAPTERS: CHAPTERS, TOTAL: ALL.length, LAST_P: LAST_P
  };
})();
