/* =========================================================
   report-io.js — 리포트 PDF 만들기 / 어제 PDF 읽어 이어붙이기 / 화면 연결
   무거운 라이브러리(jsPDF·pdf.js·한글 폰트)는 필요할 때만 불러온다.
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* =========================================================
     스크립트 지연 로딩
     ========================================================= */
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error(src + ' 을 불러오지 못했습니다')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  function needPdfMaker() {
    return loadScript('js/lib/jspdf.umd.min.js')
      .then(function () { return loadScript('js/lib/font-nanum.js'); });
  }
  function needPdfReader() {
    return loadScript('js/lib/pdf.min.js').then(function () {
      var lib = window.pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = 'js/lib/pdf.worker.min.js';
      return lib;
    });
  }

  /* =========================================================
     데이터 블록 — 누적 기록을 PDF 안에 텍스트로 심는다
     배열 형태로 눌러 담아 몇 달치도 몇 줄에 들어가게 한다
       [ "YYMMDD", 초, 타건, 오타, 정확도, 최고타수 ]
     ========================================================= */
  function packHistory() {
    var hist = REPORT.history();
    var rows = hist.map(function (x) {
      return [
        x.date.slice(2).replace(/-/g, ''),
        x.d.sec | 0, x.d.keys | 0, x.d.err | 0, x.d.acc | 0, x.d.cpm | 0
      ];
    });
    return { v: 1, n: APP.rec.name || '', r: rows };
  }

  function toBase64(bytes) {
    var s = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }
  function fromBase64(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** gzip 이 있으면 압축해서, 없으면 그냥 넣는다 (앞 한 글자로 구분) */
  function encodeData(obj) {
    var json = JSON.stringify(obj);
    var raw = new TextEncoder().encode(json);
    if (typeof CompressionStream === 'undefined') {
      return Promise.resolve('R' + toBase64(raw));
    }
    var cs = new CompressionStream('gzip');
    var stream = new Blob([raw]).stream().pipeThrough(cs);
    return new Response(stream).arrayBuffer().then(function (buf) {
      return 'Z' + toBase64(new Uint8Array(buf));
    });
  }

  function decodeData(str) {
    var tag = str[0], body = str.slice(1);
    var bytes = fromBase64(body);
    if (tag === 'R') {
      return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    }
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('이 브라우저에서는 압축을 풀 수 없습니다'));
    }
    var ds = new DecompressionStream('gzip');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (buf) {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
    });
  }

  /* =========================================================
     PDF 만들기
     ========================================================= */
  var A4 = { w: 210, h: 297 };
  var M = 16;                     // 여백(mm)
  var COL = A4.w - M * 2;

  /* jsPDF 는 심어 넣은 한글 폰트의 글자 너비 표를 출력 직전에야 만든다.
     그래서 getTextWidth·align·splitTextToSize 가 쓸 수 없다.
     한글은 한 글자가 1em, 영문·숫자는 대략 절반이라는 규칙으로 직접 잰다. */
  function charEm(code) {
    if ((code >= 0x1100 && code <= 0x11FF) ||     // 한글 자모
      (code >= 0x3130 && code <= 0x318F) ||       // 호환 자모
      (code >= 0xAC00 && code <= 0xD7A3) ||       // 한글 음절
      (code >= 0x2E80 && code <= 0xA4CF) ||       // 한자·기호
      (code >= 0xFF01 && code <= 0xFF60)) return 1;
    if (code === 32) return 0.28;                 // 공백
    if (code >= 0x30 && code <= 0x39) return 0.56; // 숫자
    if (code >= 0x41 && code <= 0x5A) return 0.62; // 대문자
    if (code >= 0x61 && code <= 0x7A) return 0.52; // 소문자
    return 0.38;                                   // 문장부호 등
  }
  /** 글자 너비(mm). size 는 pt */
  function tw(s, size) {
    var em = 0;
    for (var i = 0; i < s.length; i++) em += charEm(s.charCodeAt(i));
    return em * size * 0.3528;
  }
  /** 폭 안에 들어가게 줄을 나눈다 (한국어는 어절 단위로) */
  function wrapText(s, maxMm, size) {
    var words = String(s).split(' ');
    var lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (tw(t, size) <= maxMm || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function makePdf(opts) {
    opts = opts || {};
    return needPdfMaker().then(function () {
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

      doc.addFileToVFS('NanumGothic.ttf', window.NANUM_GOTHIC_BASE64);
      doc.addFont('NanumGothic.ttf', 'Nanum', 'normal');
      doc.setFont('Nanum', 'normal');

      var today = APP.todayKey();
      var sum = REPORT.summarize(today);
      var jd = REPORT.judgeDay(sum);
      var top = REPORT.missTop(sum.miss, 5);
      var hist = REPORT.history();
      var g = REPORT.goals();
      var name = APP.rec.name || '';

      var y = M;

      function text(s, x, size, color, opts) {
        doc.setFontSize(size);
        doc.setTextColor(color || '#1b2333');
        doc.text(String(s), x, y, opts);
      }
      function line(yy, color) {
        doc.setDrawColor(color || '#c9d3e4');
        doc.setLineWidth(0.3);
        doc.line(M, yy, M + COL, yy);
      }
      function page() {
        doc.addPage();
        y = M;
      }
      function room(need) {
        if (y + need > A4.h - M) page();
      }

      /* --- 머리말 --- */
      text('신답초등학교 AI 디지털 선도학교 여름캠프', M, 9, '#6b5bd6');
      y += 6;
      text('한글 타자 연습 · 오늘 학습 리포트', M, 17, '#111a2b');
      y += 7;
      text(REPORT.fmtDate(today), M, 10, '#5c6b85');
      doc.setFontSize(11);
      doc.setTextColor('#111a2b');
      var nameTx = '이름   ' + (name || '__________');
      doc.text(nameTx, M + COL - tw(nameTx, 11), y);
      y += 4;
      line(y);
      y += 8;

      /* --- 판정 --- */
      var vc = jd.passed ? '#1f8a4c' : jd.grade === '조금 더' ? '#b07d10' : '#c0392b';
      var vbg = jd.passed ? '#e8f8ee' : jd.grade === '조금 더' ? '#fdf4e0' : '#fdecea';
      var vh = 6 + jd.checks.length * 5.2;
      doc.setFillColor(vbg);
      doc.roundedRect(M, y - 4.5, COL, vh, 2, 2, 'F');
      text(jd.grade, M + 5, 15, vc);
      var cx = M + 32;
      var cy = y;
      doc.setFontSize(9.5);
      // 나눔고딕에 체크 글자가 없어서 ● / ○ 로 표시한다
      jd.checks.forEach(function (c) {
        doc.setTextColor(c.ok ? '#1f8a4c' : '#8a93a5');
        doc.text((c.ok ? '● ' : '○ ') + c.label + ' — ' + c.got, cx, cy);
        cy += 5.2;
      });
      y += vh + 3;

      /* --- 오늘 숫자 --- */
      var cards = [
        ['연습 시간', REPORT.fmtMin(sum.sec), '목표 ' + g.minutes + '분'],
        ['친 글자 수', sum.keys.toLocaleString() + '타', '오타 ' + sum.err + '번'],
        ['가장 빠른 타수', sum.cpm + '타', '분당'],
        ['정확도', sum.acc + '%', '목표 ' + g.acc + '%']
      ];
      var cw = COL / 4;
      cards.forEach(function (c, i) {
        var x = M + cw * i;
        doc.setDrawColor('#d8e0ee');
        doc.setFillColor('#f7f9fd');
        doc.roundedRect(x + 1, y, cw - 2, 18, 2, 2, 'FD');
        doc.setFontSize(7.5); doc.setTextColor('#7b879c');
        doc.text(c[0], x + 4, y + 5.5);
        doc.setFontSize(13); doc.setTextColor('#111a2b');
        doc.text(c[1], x + 4, y + 12.2);
        doc.setFontSize(7); doc.setTextColor('#8a93a5');
        doc.text(c[2], x + 4, y + 16.2);
      });
      y += 24;

      /* --- 한 것 / 안 한 것 --- */
      var MODE_LABEL = {
        place: '자리 연습', word: '낱말 연습', short: '짧은 글',
        long: '긴 글', game: '타자 게임'
      };
      var ALL = ['place', 'word', 'short', 'long', 'game'];
      var did = ALL.filter(function (m) { return sum.modes[m]; });
      var not = ALL.filter(function (m) { return !sum.modes[m]; });

      room(30);
      text('오늘 한 것', M, 11, '#111a2b');
      y += 6;
      doc.setFontSize(10); doc.setTextColor('#33405a');
      doc.text(did.length
        ? did.map(function (m) { return MODE_LABEL[m] + ' ' + sum.modes[m] + '번'; }).join('   ·   ')
        : '아직 연습을 시작하지 않았습니다.', M, y);
      y += 8;
      text('아직 안 한 것', M, 11, '#111a2b');
      y += 6;
      doc.setFontSize(10); doc.setTextColor(not.length ? '#c0392b' : '#1f8a4c');
      doc.text(not.length
        ? not.map(function (m) { return MODE_LABEL[m]; }).join('   ·   ')
        : '다섯 가지를 모두 해냈습니다.', M, y);
      y += 10;

      /* --- 단계별 표 --- */
      room(20 + DATA.LEVELS.length * 6);
      text('단계별 기록', M, 11, '#111a2b');
      y += 6;
      var cols = [0, 22, 58, 78, 106, 132, 158];
      var head = ['단계', '이름', '횟수', '최고 타수', '정확도', '목표'];
      doc.setFillColor('#eef2f9');
      doc.rect(M, y - 4, COL, 7, 'F');
      doc.setFontSize(8.5); doc.setTextColor('#5c6b85');
      head.forEach(function (t, i) { doc.text(t, M + cols[i] + 2, y); });
      y += 6;

      DATA.LEVELS.forEach(function (lv) {
        var b = sum.byLevel[lv.no];
        var target = g.cpm[lv.no];
        var ok = b && b.cpm >= target;
        if (ok) {
          doc.setFillColor('#eefaf1');
          doc.rect(M, y - 4, COL, 6.4, 'F');
        }
        doc.setFontSize(9);
        doc.setTextColor(b ? '#1b2333' : '#a6afc0');
        var row = b
          ? [lv.no + '단계', lv.name, b.n + '번', b.cpm + '타', b.acc + '%', ok ? '통과' : target + '타']
          : [lv.no + '단계', lv.name, '-', '오늘 안 함', '-', target + '타'];
        row.forEach(function (t, i) {
          if (i === 5 && ok) doc.setTextColor('#1f8a4c');
          doc.text(String(t), M + cols[i] + 2, y);
          if (i === 5 && ok) doc.setTextColor(b ? '#1b2333' : '#a6afc0');
        });
        doc.setDrawColor('#e6ebf4');
        doc.line(M, y + 2.2, M + COL, y + 2.2);
        y += 6.4;
      });
      y += 6;

      /* --- 자주 틀린 자리 --- */
      room(24);
      text('자주 틀린 자리', M, 11, '#111a2b');
      y += 6;
      doc.setFontSize(10); doc.setTextColor('#33405a');
      if (top.length) {
        doc.text(top.map(function (t) {
          return t.jamo + ' (' + t.finger + ') ' + t.count + '번';
        }).join('   ·   '), M, y);
        y += 5.5;
        doc.setFontSize(8.5); doc.setTextColor('#8a93a5');
        doc.text('이 자리들을 자리 연습에서 한 번 더 해 보면 좋겠습니다.', M, y);
      } else {
        doc.setTextColor('#1f8a4c');
        doc.text('눈에 띄게 틀린 자리가 없습니다.', M, y);
      }
      y += 10;

      /* --- 게임 --- */
      if (sum.games.length) {
        room(16 + sum.games.length * 5);
        text('오늘 한 게임', M, 11, '#111a2b');
        y += 6;
        doc.setFontSize(9); doc.setTextColor('#33405a');
        sum.games.slice(-6).forEach(function (gm) {
          doc.text(gm.name + '  ·  ' + gm.level + '단계 ' + gm.diffName +
            '  ·  ' + gm.score + '점  ·  ' + gm.cpm + '타', M, y);
          y += 5;
        });
        y += 5;
      }

      /* --- 누적 --- */
      if (hist.length > 1) {
        room(34);
        var first = hist[0], last = hist[hist.length - 1];
        var tk = 0, ts = 0;
        hist.forEach(function (x) { tk += x.d.keys || 0; ts += x.d.sec || 0; });
        text('지금까지 쌓인 기록', M, 11, '#111a2b');
        y += 6;
        doc.setFontSize(10); doc.setTextColor('#33405a');
        doc.text('연습한 날 ' + hist.length + '일   ·   모두 ' + tk.toLocaleString() +
          '타   ·   총 ' + REPORT.fmtMin(ts), M, y);
        y += 5.5;
        doc.text('첫날 ' + first.d.cpm + '타 → 오늘 ' + last.d.cpm + '타   (' +
          (last.d.cpm - first.d.cpm >= 0 ? '+' : '') + (last.d.cpm - first.d.cpm) + '타)', M, y);
        y += 7;

        // 최근 21일 막대
        var show = hist.slice(-21);
        var maxC = 1;
        show.forEach(function (x) { if (x.d.cpm > maxC) maxC = x.d.cpm; });
        var bw = Math.min(COL / show.length, 14);
        var bx = M + (COL - bw * show.length) / 2;
        var bh = 20;
        var base = y + bh + 4;
        show.forEach(function (x, i) {
          var hgt = Math.max(1.2, x.d.cpm / maxC * bh);
          doc.setFillColor(x.date === today ? '#6b5bd6' : '#9fb3d4');
          doc.rect(bx + bw * i + bw * 0.2, base - hgt, bw * 0.6, hgt, 'F');
          // 막대 위에 타수
          if (show.length <= 14) {
            doc.setFontSize(6);
            doc.setTextColor(x.date === today ? '#6b5bd6' : '#8a93a5');
            var vv = String(x.d.cpm);
            doc.text(vv, bx + bw * i + bw * 0.5 - tw(vv, 6) / 2, base - hgt - 1.4);
          }
        });
        doc.setFontSize(6); doc.setTextColor('#8a93a5');
        show.forEach(function (x, i) {
          if (show.length > 12 && i % 2) return;
          var lb = x.date.slice(5).replace('-', '/');
          doc.text(lb, bx + bw * i + bw * 0.5 - tw(lb, 6) / 2, base + 3.2);
        });
        y = base + 8;
      }

      /* --- 선생님 한마디 --- */
      var comment = REPORT.getComment() || '';
      if (comment) {
        room(26);
        text('선생님 한마디', M, 11, '#111a2b');
        y += 6;
        doc.setFontSize(10); doc.setTextColor('#33405a');
        var lines = wrapText(comment, COL, 10);
        lines.forEach(function (ln) {
          room(6);
          doc.text(ln, M, y);
          y += 5.4;
        });
        y += 4;
      }

      /* --- 데이터 블록 --- */
      return encodeData(packHistory()).then(function (payload) {
        room(40);
        line(y, '#dfe6f1');
        y += 4;
        doc.setFontSize(7.5); doc.setTextColor('#98a3b7');
        doc.text('아래 글자는 다음 날 기록을 이어 붙이는 데 쓰입니다. 지우거나 가리지 마세요.', M, y);
        y += 4;

        /* 데이터 블록만 표준 폰트로 찍는다.
           심어 넣은 한글 폰트로 찍으면 PDF에서 글자를 다시 읽어낼 수 없다. */
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor('#7d8798');
        doc.text(REPORT.MARK_A, M, y);
        y += 3;

        var per = 132;                       // 한 줄에 들어갈 글자 수
        for (var i = 0; i < payload.length; i += per) {
          if (y > A4.h - M - 6) { doc.addPage(); y = M; }
          doc.text(payload.slice(i, i + per), M, y);
          y += 2.8;
        }
        doc.text(REPORT.MARK_B, M, y);
        y += 6;

        doc.setFont('Nanum', 'normal');
        doc.setFontSize(7.5); doc.setTextColor('#98a3b7');
        doc.text('이 리포트는 학생 컴퓨터에만 저장되며, 이름은 외부로 전송되지 않습니다.', M, y);

        var fname = '타자연습_' + (name ? name + '_' : '') + today + '.pdf';
        // 검증용: 파일로 저장하지 않고 바이트만 돌려줄 수 있다
        if (opts.asBytes) return { name: fname, bytes: doc.output('arraybuffer') };
        doc.save(fname);
        return fname;
      });
    });
  }

  /* =========================================================
     어제 PDF 읽어서 이어 붙이기
     ========================================================= */
  function readPdf(file) {
    return needPdfReader().then(function (pdfjsLib) {
      return file.arrayBuffer();
    }).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (pdf) {
      var jobs = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        jobs.push(pdf.getPage(p).then(function (pg) { return pg.getTextContent(); }));
      }
      return Promise.all(jobs);
    }).then(function (pages) {
      var all = pages.map(function (tc) {
        return tc.items.map(function (it) { return it.str; }).join('\n');
      }).join('\n');
      return all;
    });
  }

  function extractPayload(text) {
    // pdf.js 는 한 줄을 여러 조각으로 나눠 주기도 한다.
    // 공백을 모두 없앤 뒤에 표시를 찾아야 안전하다.
    var flat = String(text).replace(/\s+/g, '');
    var a = flat.indexOf(REPORT.MARK_A);
    var b = flat.indexOf(REPORT.MARK_B);
    if (a < 0 || b < 0 || b <= a) return null;
    var mid = flat.slice(a + REPORT.MARK_A.length, b);
    var cleaned = mid.replace(/[^A-Za-z0-9+/=]/g, '');
    return cleaned || null;
  }

  function mergeHistory(data) {
    if (!data || !data.r) throw new Error('기록을 찾지 못했습니다');
    if (!APP.rec.imported) APP.rec.imported = {};
    var added = 0, dates = [];
    data.r.forEach(function (row) {
      var d = String(row[0]);              // YYMMDD
      if (d.length !== 6) return;
      var key = '20' + d.slice(0, 2) + '-' + d.slice(2, 4) + '-' + d.slice(4, 6);
      // 이 컴퓨터에서 실제로 연습한 날은 그 기록이 우선.
      // 리포트 화면만 열어도 빈 기록이 생기므로, 빈 날은 PDF 기록으로 채운다.
      var local = APP.rec.days[key];
      if (local && ((local.practice && local.practice.length) ||
        (local.games && local.games.length))) return;
      if (!APP.rec.imported[key]) added++;
      APP.rec.imported[key] = {
        sec: row[1] | 0, keys: row[2] | 0, err: row[3] | 0,
        acc: row[4] | 0, cpm: row[5] | 0
      };
      dates.push(key);
    });
    if (data.n && !APP.rec.name) APP.rec.name = data.n;
    APP.save();
    return { added: added, total: data.r.length, name: data.n || '' };
  }

  function handleUpload(file) {
    if (!file) return;
    APP.toast('리포트를 읽는 중…');
    readPdf(file)
      .then(function (text) {
        var payload = extractPayload(text);
        if (!payload) {
          throw new Error('이 PDF에는 이어 붙일 기록이 없습니다. 이 앱에서 내려받은 리포트인지 확인해 주세요.');
        }
        return decodeData(payload);
      })
      .then(mergeHistory)
      .then(function (r) {
        REPORT.resetComment();
        REPORT.render();
        APP.renderHome();
        APP.toast(r.added
          ? '지난 기록 ' + r.added + '일치를 이어 붙였습니다.'
          : '지난 기록이 이미 이 컴퓨터에 다 있습니다. 올리지 않아도 되니 그대로 연습하면 됩니다.');
      })
      .catch(function (e) {
        APP.toast(e.message || '리포트를 읽지 못했습니다.');
      });
  }

  /* =========================================================
     연결
     ========================================================= */
  /** 지난 기록이 하나도 없으면 어제 리포트를 먼저 불러오라고 알려 준다 */
  function hasPastRecord() {
    var today = APP.todayKey();
    var imp = APP.rec.imported || {};
    for (var k in imp) if (k !== today) return true;
    for (var d in APP.rec.days) if (d !== today) return true;
    return false;
  }

  function init() {
    $('btn-open-report').onclick = function () {
      REPORT.resetComment();
      APP.show('report');
      REPORT.render();
    };

    $('pdf-upload').addEventListener('change', function () {
      handleUpload(this.files && this.files[0]);
      this.value = '';
    });

    $('btn-pdf').onclick = function () {
      var btn = this;
      // 어제 것을 안 불러왔으면 기록이 끊긴다. 내려받기 전에 한 번 짚어 준다.
      if (!hasPastRecord() && !btn._warned) {
        btn._warned = true;
        APP.toast('지난 기록이 없습니다. 어제 리포트가 있으면 먼저 불러오세요. 한 번 더 누르면 그대로 내려받습니다.');
        return;
      }
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = '만드는 중…';
      makePdf()
        .then(function (fn) { APP.toast(fn + ' 을 내려받았습니다.'); })
        .catch(function (e) {
          console.error(e);
          APP.toast(e.message || 'PDF를 만들지 못했습니다.');
        })
        .then(function () { btn.disabled = false; btn.textContent = old; });
    };
  }

  document.addEventListener('DOMContentLoaded', init);

  // 테스트에서 쓸 수 있게 열어 둔다
  window.REPORT_IO = {
    makePdf: makePdf, readPdf: readPdf, extractPayload: extractPayload,
    encodeData: encodeData, decodeData: decodeData,
    packHistory: packHistory, mergeHistory: mergeHistory
  };
})();
