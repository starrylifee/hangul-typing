/* =========================================================
   keyboard.js — 가상 자판 그리기 + 다음 키 안내
   ========================================================= */
var KB = (function () {
  'use strict';

  var ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  var SHIFTED = { q: 'ㅃ', w: 'ㅉ', e: 'ㄸ', r: 'ㄲ', t: 'ㅆ', o: 'ㅒ', p: 'ㅖ' };

  var FCOLOR = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)',
    'var(--f4)', 'var(--f5)', 'var(--f6)', 'var(--f7)'];

  var el = null;         // 자판 컨테이너
  var keyEls = {};       // key -> element
  var hintEl = null;

  /** 자판을 그린다. allowed 가 있으면 그 밖의 키는 흐리게 */
  function render(container, hintContainer, allowedSet) {
    el = container;
    hintEl = hintContainer;
    el.innerHTML = '';
    keyEls = {};

    ROWS.forEach(function (row, ri) {
      var rowEl = document.createElement('div');
      rowEl.className = 'kb-row r' + (ri + 1);

      // 아랫줄 왼쪽에 Shift 표시
      if (ri === 2) {
        var sh = document.createElement('div');
        sh.className = 'key mod';
        sh.innerHTML = '<span class="main">Shift</span>';
        sh.dataset.key = 'Shift';
        rowEl.appendChild(sh);
        keyEls['Shift'] = sh;
      }

      row.forEach(function (k) {
        var kEl = document.createElement('div');
        kEl.className = 'key';
        kEl.dataset.key = k;
        var f = HG.fingerOf(k);
        kEl.style.setProperty('--fc', FCOLOR[f] || 'var(--dim2)');
        var shiftMark = SHIFTED[k] ? '<span class="shift">' + SHIFTED[k] + '</span>' : '';
        kEl.innerHTML =
          shiftMark +
          '<span class="main">' + HG.KEYMAP[k] + '</span>' +
          '<span class="eng">' + k.toUpperCase() + '</span>';
        rowEl.appendChild(kEl);
        keyEls[k] = kEl;
      });
      el.appendChild(rowEl);
    });

    // 스페이스 줄
    var sp = document.createElement('div');
    sp.className = 'kb-row';
    var spKey = document.createElement('div');
    spKey.className = 'key spacebar';
    spKey.dataset.key = ' ';
    spKey.innerHTML = '<span class="main" style="font-size:12px;color:var(--dim2)">스페이스</span>';
    sp.appendChild(spKey);
    keyEls[' '] = spKey;
    el.appendChild(sp);

    setAllowed(allowedSet);
  }

  /** 이 단계에서 쓰는 키만 밝게 */
  function setAllowed(allowedSet) {
    for (var k in keyEls) {
      if (k === ' ') continue;
      var on = !allowedSet || allowedSet[k] ||
        (k === 'Shift' && hasShiftKey(allowedSet));
      keyEls[k].classList.toggle('off', !on);
      keyEls[k].classList.toggle('on', !!on);
    }
  }

  function hasShiftKey(set) {
    if (!set) return true;
    for (var k in set) if (k !== k.toLowerCase()) return true;
    return false;
  }

  /** 다음에 눌러야 할 키를 강조 */
  function highlight(key) {
    for (var k in keyEls) keyEls[k].classList.remove('next');
    if (!key) {
      if (hintEl) hintEl.innerHTML = '<span class="chip"></span><span>준비</span>';
      return;
    }
    var isShift = key !== key.toLowerCase() && HG.KEYMAP[key];
    var base = isShift ? key.toLowerCase() : key;

    if (keyEls[base]) keyEls[base].classList.add('next');
    if (isShift && keyEls['Shift']) keyEls['Shift'].classList.add('next');

    if (hintEl) {
      if (key === ' ') {
        hintEl.innerHTML = '<span class="chip" style="--fc:var(--dim)"></span><span>엄지로 <b>스페이스</b></span>';
        return;
      }
      var f = HG.fingerOf(base);
      var name = HG.FINGER_NAME[f] || '';
      var jamo = HG.KEYMAP[key] || key;
      hintEl.innerHTML =
        '<span class="chip" style="--fc:' + (FCOLOR[f] || 'var(--dim)') + '"></span>' +
        '<span>' + (isShift ? '<b>Shift</b> 누른 채 ' : '') + '<b>' + name + '</b>로 <b>' + jamo + '</b></span>';
    }
  }

  /** 실제로 누른 키를 잠깐 눌린 것처럼 (선택) */
  function flash(key) {
    var kEl = keyEls[key];
    if (!kEl) return;
    kEl.style.transform = 'translateY(2px)';
    setTimeout(function () { kEl.style.transform = ''; }, 70);
  }

  return { render: render, setAllowed: setAllowed, highlight: highlight, flash: flash, FCOLOR: FCOLOR };
})();
