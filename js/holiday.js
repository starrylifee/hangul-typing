/* =========================================================
   holiday.js — 특별한 날에는 마을 하늘이 바뀐다
   달마다 하루씩, 그날 마을에 들어오면 배경이 달라진다.
   아이템을 새로 주지는 않는다. 하늘만 갈아끼운다.

   날씨 연동은 넣지 않았다. 다른 학교도 쓸 수 있어서 한 곳의 좌표를
   박아 두면 틀린 날씨가 되고, 위치를 물으면 학생 기기마다 권한 팝업이 뜬다.
   날짜는 어느 학교에서나 똑같이 맞다.

   장식은 두 갈래로 나눈다.
     back : 늘어나도 되는 것 (별·은하수·눈·꽃잎). 화면을 통째로 채운다.
     pins : 비율을 지켜야 하는 것 (해·달·풍선·호박). 원이 타원이 되면 안 된다.
   ========================================================= */
var HOLIDAY = (function () {
  'use strict';

  /* ---------- 음력 기념일 ----------
     ⚠ 아래 날짜는 한국천문연구원(KASI) 음양력 자료로 한 번 확인해야 한다.
     틀렸으면 이 표만 고치면 된다. 표에 없는 해는 그냥 지나간다. */
  var LUNAR = {
    daeboreum: {   // 정월대보름 (음력 1월 15일)
      2026: '03-03', 2027: '02-20', 2028: '02-09',
      2029: '02-27', 2030: '02-16', 2031: '02-06', 2032: '02-25'
    },
    dano: {        // 단오 (음력 5월 5일)
      2026: '06-19', 2027: '06-09', 2028: '06-27',
      2029: '06-16', 2030: '06-05', 2031: '06-24', 2032: '06-12'
    },
    chilseok: {    // 칠석 (음력 7월 7일)
      2026: '08-19', 2027: '08-08', 2028: '08-26',
      2029: '08-16', 2030: '08-05', 2031: '08-24', 2032: '08-12'
    },
    chuseok: {     // 추석 (음력 8월 15일)
      2026: '09-25', 2027: '09-15', 2028: '10-03',
      2029: '09-22', 2030: '09-12', 2031: '10-01', 2032: '09-19'
    }
  };

  /* =========================================================
     장식 조각 — pin 안에 들어가는 것은 viewBox 0 0 100 100 기준
     ========================================================= */
  function sun(c1, c2) {
    return '<circle cx="50" cy="50" r="48" fill="' + c2 + '" opacity="0.26"/>'
      + '<circle cx="50" cy="50" r="38" fill="' + c2 + '" opacity="0.4"/>'
      + '<circle cx="50" cy="50" r="29" fill="' + c1 + '"/>';
  }
  function moon() {
    return '<circle cx="50" cy="50" r="48" fill="#fff6cf" opacity="0.14"/>'
      + '<circle cx="50" cy="50" r="38" fill="#fff6cf" opacity="0.2"/>'
      + '<circle cx="50" cy="50" r="29" fill="#fdf3c8"/>'
      + '<circle cx="42" cy="43" r="6.2" fill="#f0e3ac" opacity=".85"/>'
      + '<circle cx="59" cy="53" r="4.6" fill="#f0e3ac" opacity=".85"/>'
      + '<circle cx="48" cy="62" r="3.6" fill="#f0e3ac" opacity=".85"/>';
  }
  function bigstar(c) {
    return '<path d="M50 8 L59 40 L92 50 L59 60 L50 92 L41 60 L8 50 L41 40 Z" fill="' + c + '"/>'
      + '<circle cx="50" cy="50" r="11" fill="#ffffff" opacity=".85"/>';
  }
  function balloon(c) {
    return '<ellipse cx="50" cy="38" rx="27" ry="33" fill="' + c + '"/>'
      + '<path d="M50 71 l-6 9 h12 z" fill="' + c + '"/>'
      + '<path d="M50 80 q12 12 -4 20" stroke="#ffffff" stroke-width="2.6" fill="none" opacity=".7"/>'
      + '<ellipse cx="40" cy="27" rx="7" ry="10" fill="#ffffff" opacity=".5"/>';
  }
  function sprout() {
    return '<path d="M50 92 V44" stroke="#6fc06a" stroke-width="6" stroke-linecap="round" fill="none"/>'
      + '<path d="M50 58 Q24 52 18 28 Q46 28 50 54 Z" fill="#8fd98a"/>'
      + '<path d="M50 50 Q76 44 82 20 Q54 20 50 46 Z" fill="#6fc06a"/>'
      + '<ellipse cx="50" cy="94" rx="20" ry="4" fill="#b08968" opacity=".55"/>';
  }
  function pumpkin() {
    return '<ellipse cx="50" cy="56" rx="44" ry="38" fill="#ff9f43"/>'
      + '<ellipse cx="28" cy="56" rx="15" ry="36" fill="#ffb566" opacity=".65"/>'
      + '<ellipse cx="72" cy="56" rx="15" ry="36" fill="#ffb566" opacity=".65"/>'
      + '<rect x="45" y="10" width="10" height="14" rx="4" fill="#6fc06a"/>'
      + '<path d="M55 14 Q72 6 78 16" stroke="#6fc06a" stroke-width="4" fill="none" stroke-linecap="round"/>'
      // 무섭지 않게 — 눈은 동그랗게, 입은 웃는 곡선
      + '<circle cx="35" cy="48" r="6.5" fill="#4a3f35"/>'
      + '<circle cx="65" cy="48" r="6.5" fill="#4a3f35"/>'
      + '<circle cx="37" cy="45.5" r="2.2" fill="#ffffff"/>'
      + '<circle cx="67" cy="45.5" r="2.2" fill="#ffffff"/>'
      + '<circle cx="22" cy="62" r="6" fill="#ffb3a3" opacity=".85"/>'
      + '<circle cx="78" cy="62" r="6" fill="#ffb3a3" opacity=".85"/>'
      + '<path d="M36 68 Q50 80 64 68" stroke="#4a3f35" stroke-width="5"'
      + ' fill="none" stroke-linecap="round"/>';
  }

  /* ---------- 화면을 통째로 채우는 것 (늘어나도 됨) ---------- */
  function rnd(seed) {
    var v = seed;
    return function () { v = (v * 9301 + 49297) % 233280; return v / 233280; };
  }
  function stars(n, seed, maxY) {
    var r = rnd(seed), s = '';
    for (var i = 0; i < n; i++) {
      var x = r() * 100, y = r() * (maxY || 55), sz = 0.25 + r() * 0.45, op = 0.5 + r() * 0.5;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + sz.toFixed(2)
        + '" fill="#fff" opacity="' + op.toFixed(2) + '"/>';
    }
    return s;
  }
  function milkyway() {
    return '<path d="M4 34 Q28 20 50 22 Q72 24 96 12" stroke="#cfd8ff" stroke-width="7"'
      + ' fill="none" opacity="0.14" stroke-linecap="round"/>'
      + '<path d="M4 34 Q28 20 50 22 Q72 24 96 12" stroke="#eef2ff" stroke-width="2.6"'
      + ' fill="none" opacity="0.2" stroke-linecap="round"/>';
  }
  function snowflakes() {
    var r = rnd(99), s = '';
    for (var i = 0; i < 46; i++) {
      var x = r() * 100, y = r() * 44, sz = 0.4 + r() * 0.7, op = 0.5 + r() * 0.45;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + sz.toFixed(2)
        + '" fill="#fff" opacity="' + op.toFixed(2) + '"/>';
    }
    return s;
  }
  function petals() {
    var r = rnd(41), s = '';
    for (var i = 0; i < 34; i++) {
      var x = r() * 100, y = r() * 42, sz = 0.7 + r() * 0.8, op = 0.45 + r() * 0.4;
      s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + sz.toFixed(2)
        + '" ry="' + (sz * 0.62).toFixed(2) + '" fill="#ffb7ce" opacity="' + op.toFixed(2) + '"/>';
    }
    return s;
  }
  /** 입동 — 서리. 공중에 흩날리는 결정과 아래쪽에 깔린 성에 */
  function frost() {
    var r = rnd(63), s = '';
    // 하늘에 흩날리는 얼음 알갱이
    for (var i = 0; i < 40; i++) {
      var x = r() * 100, y = r() * 43, sz = 0.5 + r() * 0.75;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + sz.toFixed(2)
        + '" fill="#ffffff" opacity="' + (0.55 + r() * 0.4).toFixed(2) + '"/>';
    }
    // 여섯 갈래 서리 결정 몇 개 — 입동임을 알아보게
    [[16, 12, 4.5], [44, 8, 3.4], [63, 16, 3.8], [88, 11, 3.1], [30, 24, 2.8]]
      .forEach(function (f) {
        var g = '';
        for (var a = 0; a < 6; a++) {
          g += '<line x1="0" y1="0" x2="0" y2="-' + f[2] + '" transform="rotate(' + (a * 60) + ')"/>'
            + '<line x1="0" y1="-' + (f[2] * .55) + '" x2="' + (f[2] * .3) + '" y2="-' + (f[2] * .82)
            + '" transform="rotate(' + (a * 60) + ')"/>'
            + '<line x1="0" y1="-' + (f[2] * .55) + '" x2="-' + (f[2] * .3) + '" y2="-' + (f[2] * .82)
            + '" transform="rotate(' + (a * 60) + ')"/>';
        }
        s += '<g transform="translate(' + f[0] + ' ' + f[1] + ')" stroke="#ffffff"'
          + ' stroke-width="0.42" stroke-linecap="round" opacity="0.9">' + g + '</g>';
      });
    // 하늘 아래쪽에 낀 성에
    s += '<path d="M0 40 Q25 36 50 39 Q75 42 100 38 L100 44 L0 44 Z" fill="#ffffff" opacity="0.4"/>';
    return s;
  }

  /** 핼러윈 — 하늘을 가로지르는 귀여운 박쥐 (얼굴 없이 실루엣만, 무섭지 않게) */
  function bats() {
    function bat(x, y, s) {
      return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="#2a1836"'
        + ' opacity="0.75">'
        + '<ellipse cx="0" cy="0" rx="1.1" ry="1.3"/>'
        + '<path d="M-1 -0.2 Q-3 -1.6 -4.6 -0.3 Q-3.4 -0.1 -3 0.9 Q-2 -0.1 -1 0.6 Z"/>'
        + '<path d="M1 -0.2 Q3 -1.6 4.6 -0.3 Q3.4 -0.1 3 0.9 Q2 -0.1 1 0.6 Z"/>'
        + '<path d="M-0.7 -1.1 l-0.3 -0.8 l0.7 0.4 Z M0.7 -1.1 l0.3 -0.8 l-0.7 0.4 Z"/>'
        + '</g>';
    }
    return bat(22, 13, 1) + bat(37, 8, 0.75) + bat(53, 15, 0.85) + bat(64, 9, 0.6);
  }
  /** 한글날 — 하늘에 자모가 떠 있다.
      preserveAspectRatio="none" 판에 글자를 넣으면 가로로 늘어나므로
      글자는 pin 으로 따로 얹는다. 여기서는 자리만 정해 준다. */
  var JAMO = [
    ['ㄱ', 7, 11, 7], ['ㄴ', 19, 5, 6], ['ㄷ', 30, 14, 6.5], ['ㅁ', 41, 4, 7],
    ['ㅂ', 52, 13, 6], ['ㅅ', 63, 5, 7], ['ㅇ', 74, 13, 6.5], ['ㅈ', 85, 4, 6],
    ['ㅎ', 93, 14, 7], ['ㅏ', 13, 23, 5.5], ['ㅓ', 25, 27, 5], ['ㅗ', 45, 24, 5.5],
    ['ㅜ', 67, 26, 5], ['ㅣ', 88, 24, 5]
  ];
  function jamoPins() {
    return JAMO.map(function (j, i) {
      var op = (0.5 + (i % 4) * 0.11).toFixed(2);
      return pin(j[1], j[2], j[3],
        '<text x="50" y="72" font-size="76" fill="#1f4e78" opacity="' + op + '"'
        + ' font-family="Malgun Gothic, AppleGothic, sans-serif" font-weight="800"'
        + ' text-anchor="middle">' + j[0] + '</text>');
    });
  }
  /** 단오 — 창포 잎 (땅에 심긴다) */
  function iris() {
    return '<path d="M50 96 Q38 62 26 26 Q44 44 50 78 Z" fill="#5cb85c"/>'
      + '<path d="M50 96 Q62 60 76 22 Q56 42 50 76 Z" fill="#6fc06a"/>'
      + '<path d="M50 96 Q48 58 44 8 Q56 50 54 96 Z" fill="#8fd98a"/>'
      + '<g fill="#9c8ff0"><circle cx="40" cy="30" r="6"/><circle cx="48" cy="24" r="6"/>'
      + '<circle cx="56" cy="30" r="6"/><circle cx="48" cy="36" r="6"/></g>'
      + '<circle cx="48" cy="30" r="3.4" fill="#ffd166"/>'
      + '<ellipse cx="50" cy="96" rx="18" ry="4" fill="#b08968" opacity=".45"/>';
  }

  function sky(inner) {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
      + inner + '</svg>';
  }
  /** 하늘에 뜨는 장식. x·y 는 왼쪽 위 기준 %, w 는 너비 % */
  function pin(x, y, w, inner) {
    return {
      x: x, y: y, w: w,
      svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>'
    };
  }
  /** 땅에 놓이는 장식. 마을 앞으로 나와야 언덕에 안 가린다. b 는 바닥에서 % */
  function put(x, b, w, inner) {
    return {
      x: x, b: b, w: w,
      svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>'
    };
  }

  /* =========================================================
     특별한 날 — 달마다 하나씩
     ========================================================= */
  var DAYS = [
    {
      id: 'newyear', name: '새해 첫날', icon: '🌅', md: ['01-01'],
      note: '새해 복 많이 받으세요! 올해도 한 자 한 자 또박또박.',
      sky: 'linear-gradient(#ffb37a 0%, #ffd9a0 26%, #ffeccd 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      pins: [pin(41, 18, 18, sun('#ff8f5c', '#ffcf8a'))]
    },
    {
      id: 'daeboreum', name: '정월대보름', icon: '🌕', lunar: 'daeboreum', night: true,
      note: '한 해 중 가장 크고 밝은 보름달이 뜨는 날이에요.',
      sky: 'linear-gradient(#1b2450 0%, #2f3f75 30%, #4a5c95 44%, #3f6b4a 44%, #365f42 100%)',
      ground: 'hue-rotate(14deg) saturate(.5) brightness(.6)',
      back: sky(stars(70, 7)),
      pins: [pin(42, 8, 17, moon())]
    },
    {
      id: 'samil', name: '삼일절', icon: '🇰🇷', md: ['03-01'],
      note: '1919년 오늘, 온 나라가 "대한독립 만세"를 외쳤어요.',
      sky: 'linear-gradient(#9ed4f5 0%, #cfe9fb 30%, #eaf5ff 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      flag: { x: 76, y: 5, w: 19 }
    },
    {
      id: 'sikmok', name: '식목일', icon: '🌱', md: ['04-05'],
      note: '나무를 심는 날. 마을에도 새싹이 돋았어요.',
      sky: 'linear-gradient(#bfe8b8 0%, #dff5d8 30%, #f0fbee 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      pins: [pin(80, 8, 12, sun('#ffd166', '#ffe9a8')),
      pin(28, 64, 6, sprout()), pin(66, 68, 5, sprout())]
    },
    {
      id: 'cherry', name: '벚꽃', icon: '🌸', range: ['04-01', '04-07'],
      note: '벚꽃이 활짝 폈어요. 여의도도 지금이 한창이래요.',
      sky: 'linear-gradient(#ffd9e6 0%, #ffe9f1 28%, #fff5f8 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      back: sky(petals()),
      pins: [pin(81, 7, 11, sun('#ffe9a8', '#fff3cf'))]
    },
    {
      id: 'children', name: '어린이날', icon: '🎈', md: ['05-05'],
      note: '오늘은 어린이날! 하늘에 풍선이 가득해요.',
      sky: 'linear-gradient(#8fd4ff 0%, #bfe8ff 30%, #e8f7ff 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      pins: [
        pin(8, 16, 6, balloon('#ff8fab')), pin(23, 6, 5, balloon('#ffd166')),
        pin(39, 19, 6, balloon('#9c8ff0')), pin(56, 7, 5, balloon('#6ee7a0')),
        pin(72, 17, 6, balloon('#ff9f80')), pin(88, 6, 5, balloon('#5ad4e6'))
      ]
    },
    {
      id: 'hyunchung', name: '현충일', icon: '🇰🇷', md: ['06-06'],
      note: '나라를 지키다 돌아가신 분들을 기리는 날이에요. 오전 10시에 1분간 묵념해요.',
      sky: 'linear-gradient(#8fa3b8 0%, #b4c3d2 30%, #d3dde6 44%, #93b58f 44%, #82a67e 100%)',
      flag: { x: 76, y: 5, w: 18, half: true }
    },
    {
      id: 'dano', name: '단오', icon: '🌿', lunar: 'dano',
      note: '창포물에 머리 감고 그네를 뛰던 날이에요.',
      sky: 'linear-gradient(#a8dff0 0%, #cdeefa 30%, #e8f8fd 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      pins: [pin(82, 8, 12, sun('#ffd166', '#ffe9a8'))],
      front: [put(7, 2, 7, iris()), put(31, 1, 6, iris()), put(70, 2, 6.5, iris())]
    },
    {
      id: 'chilseok', name: '칠석', icon: '🌌', lunar: 'chilseok', night: true,
      note: '견우와 직녀가 오작교에서 만나는 밤이에요.',
      sky: 'linear-gradient(#141c3d 0%, #2a2f63 26%, #43407e 44%, #37543f 44%, #2f4a38 100%)',
      ground: 'hue-rotate(20deg) saturate(.45) brightness(.55)',
      back: sky(stars(90, 21) + milkyway()),
      pins: [pin(24, 10, 6, bigstar('#ffe9a8')), pin(70, 8, 6, bigstar('#bfe0ff'))]
    },
    {
      id: 'gwangbok', name: '광복절', icon: '🇰🇷', md: ['08-15'],
      note: '1945년 오늘, 우리나라가 빛을 되찾았어요.',
      sky: 'linear-gradient(#8fd0f5 0%, #c4e6fb 30%, #e9f6ff 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      flag: { x: 76, y: 5, w: 19 }
    },
    {
      id: 'chuseok', name: '추석', icon: '🌕', lunar: 'chuseok', night: true,
      note: '한가위 보름달이 떴어요. 더도 말고 덜도 말고 오늘만 같아라.',
      sky: 'linear-gradient(#20294f 0%, #3a4270 28%, #5b5f92 44%, #6f7a3f 44%, #5e6836 100%)',
      ground: 'hue-rotate(-22deg) saturate(.62) brightness(.66)',
      back: sky(stars(60, 13)),
      pins: [pin(41, 7, 19, moon())]
    },
    {
      id: 'hangeul', name: '한글날', icon: '📜', md: ['10-09'],
      note: '여러분이 지금 치고 있는 이 글자를 만든 날이에요. 1446년, 훈민정음.',
      sky: 'linear-gradient(#a9d8f0 0%, #d3ecf8 30%, #f0f8fd 44%, #a8e6a3 44%, #8fd98a 84%, #7fc97a 100%)',
      pins: jamoPins()
    },
    {
      id: 'halloween', name: '핼러윈', icon: '🎃', md: ['10-31'], night: true,
      note: '오늘은 호박 등을 켜는 날이에요. 무섭지 않아요, 귀엽죠?',
      sky: 'linear-gradient(#2b1740 0%, #4a2a5f 22%, #7b4a7a 38%, #b06a5e 44%, #5a4a3a 44%, #46392c 100%)',
      // 언덕도 저녁빛 갈보라로 — 보라 하늘 밑에 초록 풀밭이면 따로 논다
      ground: 'hue-rotate(-38deg) saturate(.55) brightness(.72)',
      back: sky(stars(52, 31, 40) + bats()),
      pins: [pin(78, 6, 13, moon())],
      front: [put(8, 3, 7, pumpkin()), put(29, 2, 5.5, pumpkin()), put(64, 3, 6, pumpkin())]
    },
    {
      id: 'ipdong', name: '입동', icon: '❄️', md: ['11-07'],
      note: '겨울이 들어서는 날. 아침에 서리가 내리기 시작해요.',
      sky: 'linear-gradient(#b6cde2 0%, #d2e2ef 28%, #eaf3fa 44%, #cfdcd2 44%, #e2ebe4 100%)',
      // 서리가 내려 풀빛이 빠지고 희끗해진다
      ground: 'saturate(.28) brightness(1.16)',
      back: sky(frost()),
      pins: [pin(77, 9, 13, sun('#ffe0a8', '#fff2d8'))]
    },
    {
      id: 'xmas', name: '크리스마스', icon: '🎄', range: ['12-24', '12-25'], night: true,
      note: '메리 크리스마스! 마을에 눈이 내려요.',
      sky: 'linear-gradient(#16224a 0%, #27386b 28%, #3f5590 44%, #e8f1fa 44%, #f8fbff 100%)',
      ground: 'saturate(.16) brightness(1.28)',
      back: sky(stars(50, 5, 40) + snowflakes()),
      pins: [pin(84, 6, 9, moon())]
    }
  ];

  /* ---------- 오늘이 무슨 날인가 ---------- */
  function kstNow() {
    return new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
  }
  function mdOf(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** 그 날짜의 특별한 날. 없으면 null. 겹치면 목록에서 앞선 것이 이긴다
      (4월 5일은 벚꽃 주간 안이지만 식목일이 먼저 적혀 있어 식목일이 된다) */
  function of(date) {
    var d = date || kstNow();
    var md = mdOf(d), y = d.getFullYear();
    for (var i = 0; i < DAYS.length; i++) {
      var h = DAYS[i];
      if (h.md && h.md.indexOf(md) >= 0) return h;
      if (h.range && md >= h.range[0] && md <= h.range[1]) return h;
      if (h.lunar) {
        var t = LUNAR[h.lunar] && LUNAR[h.lunar][y];
        if (t && t === md) return h;
      }
    }
    return null;
  }

  /** 마을 뒤에 깔리는 하늘 한 겹 */
  function layerFor(h) {
    var layer = document.createElement('div');
    layer.className = 'vg-holiday';
    var html = h.back || '';
    (h.pins || []).forEach(function (p) {
      html += '<div class="vg-pin" style="left:' + p.x + '%;top:' + p.y + '%;width:' + p.w + '%">'
        + p.svg + '</div>';
    });
    if (h.flag && window.FLAG_KR) {
      var ht = h.flag.w * 2 / 3;
      // 조기(弔旗)는 깃대 꼭대기에서 깃면 너비만큼 내려 단다
      var top = h.flag.y + (h.flag.half ? ht * 0.95 : 0);
      html += '<div class="vg-flagpole" style="left:' + h.flag.x + '%;top:' + h.flag.y
        + '%;height:' + (h.flag.half ? 40 : 34) + '%"></div>'
        + '<div class="vg-flag" style="left:' + h.flag.x + '%;top:' + top
        + '%;width:' + h.flag.w + '%">' + FLAG_KR.svg(true) + '</div>';
    }
    layer.innerHTML = html;
    return layer;
  }

  /** 마을 앞에 오는 장식 (호박처럼 땅에 놓이는 것). 없으면 null */
  function frontFor(h) {
    if (!h.front || !h.front.length) return null;
    var layer = document.createElement('div');
    layer.className = 'vg-holiday vg-holiday-front';
    layer.innerHTML = h.front.map(function (p) {
      return '<div class="vg-pin" style="left:' + p.x + '%;bottom:' + p.b + '%;width:' + p.w + '%">'
        + p.svg + '</div>';
    }).join('');
    return layer;
  }

  /** 마을 장면에 오늘의 하늘을 씌운다. 특별한 날이 아니면 원래대로 되돌린다.
      date 를 주면 그날인 셈 치고 그린다 (미리보기·확인용) */
  function apply(scene, date) {
    if (!scene) return null;
    scene.querySelectorAll('.vg-holiday').forEach(function (n) { n.remove(); });
    scene.classList.remove('vg-night');
    scene.style.background = '';
    scene.style.removeProperty('--hd-ground');

    var h = of(date);
    if (!h) return null;
    scene.style.background = h.sky;
    if (h.night) scene.classList.add('vg-night');
    // 땅(언덕·길)에도 그날 색을 입힌다 — 하늘만 바꾸면 계절이 안 맞는다
    if (h.ground) scene.style.setProperty('--hd-ground', h.ground);
    scene.insertBefore(layerFor(h), scene.firstChild);
    var fr = frontFor(h);
    if (fr) scene.appendChild(fr);
    return h;
  }

  return {
    of: of, apply: apply, layerFor: layerFor, frontFor: frontFor,
    DAYS: DAYS, LUNAR: LUNAR
  };
})();
