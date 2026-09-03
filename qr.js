// qr.js
// ============================================================
// QR KOD YASOVCHI
// ============================================================
//
// Nega o'zimizniki? QR kodni internetdagi rasm xizmatidan
// olsa bo'lardi, lekin Android ilovasi internetsiz ochilganda
// u ishlamay qolardi. Shuning uchun kod telefonning o'zida
// chiziladi — hech qanday tashqi kutubxona kerak emas.
//
// Qo'llab-quvvatlanadi: bayt (UTF-8) rejimi, M darajali xatoga
// chidamlilik, 1–10 versiyalar (213 belgigacha matn). Bizga
// kerak bo'lgani — qisqa havola, u 2–3 versiyaga sig'adi.
//
// Ishlatish:
//
//   ZonexQR.svg("https://zonex-project.vercel.app")
//     -> <svg ...> ... </svg>   (satr)
//
//   ZonexQR.matrix("matn")
//     -> [[true,false,...], ...]   (kerak bo'lsa o'zi chizish uchun)
//
// Standart: ISO/IEC 18004.
// ============================================================

(function (root) {
  "use strict";

  // ----------------------------------------------------------
  // XATOGA CHIDAMLILIK BLOKLARI (M darajasi)
  // ----------------------------------------------------------
  //
  //   versiya: [ bitta blokdagi EC belgilar,
  //              [ [bloklar soni, blokdagi ma'lumot belgilari], ... ] ]
  // ----------------------------------------------------------

  const EC_BLOCKS = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]]
  };

  // Moslashtirish (alignment) naqshlari markazlari
  const ALIGN = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50]
  };

  // Ma'lumotdan keyin qo'shiladigan bo'sh bitlar
  const REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

  // Format ma'lumoti (M darajasi, 0–7 niqoblar uchun tayyor 15 bit)
  const FORMAT_M = [
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0
  ];

  // Versiya ma'lumoti (faqat 7 va undan yuqori versiyalarda)
  const VERSION_BITS = {
    7: 0x07c94,
    8: 0x085bc,
    9: 0x09a99,
    10: 0x0a4d3
  };

  // ----------------------------------------------------------
  // GALUA MAYDONI GF(256) — Rid-Solomon uchun
  // ----------------------------------------------------------

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);

  (function buildTables() {
    let x = 1;

    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;

      x <<= 1;

      if (x & 0x100) x ^= 0x11d;
    }

    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (!a || !b) return 0;

    return EXP[LOG[a] + LOG[b]];
  }

  // Darajasi `count` bo'lgan generator ko'phadi
  function generatorPoly(count) {
    let poly = [1];

    for (let i = 0; i < count; i++) {
      const next = new Array(poly.length + 1).fill(0);

      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }

      poly = next;
    }

    return poly;
  }

  // Blok uchun xatoga chidamlilik belgilarini hisoblaydi
  function ecCodewords(data, count) {
    const gen = generatorPoly(count);

    const rest = new Array(count).fill(0);

    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rest[0];

      rest.shift();
      rest.push(0);

      if (factor) {
        for (let j = 0; j < count; j++) {
          rest[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }

    return rest;
  }

  // ----------------------------------------------------------
  // MATNNI BITLARGA
  // ----------------------------------------------------------

  function utf8Bytes(text) {
    const out = [];

    const value = String(text);

    for (let i = 0; i < value.length; i++) {
      let code = value.charCodeAt(i);

      // Surrogat juftlik (emoji va h.k.)
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
        const low = value.charCodeAt(i + 1);

        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }

      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 63),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63)
        );
      }
    }

    return out;
  }

  function totalData(version) {
    return EC_BLOCKS[version][1].reduce(
      (sum, group) => sum + group[0] * group[1],
      0
    );
  }

  function pickVersion(length) {
    for (let version = 1; version <= 10; version++) {
      // 4 bit rejim + 8 bit uzunlik = 12 bit qo'shimcha
      if (length + 2 <= totalData(version)) return version;
    }

    return 0;
  }

  // Ma'lumot belgilari: rejim + uzunlik + baytlar + to'ldiruvchi
  function dataCodewords(bytes, version) {
    const capacity = totalData(version);

    const bits = [];

    const push = (value, count) => {
      for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };

    push(4, 4); // bayt rejimi
    push(bytes.length, 8); // 1–9 versiyalarda uzunlik 8 bit

    bytes.forEach((byte) => push(byte, 8));

    // Tugatuvchi
    for (let i = 0; i < 4 && bits.length < capacity * 8; i++) bits.push(0);

    // Baytga to'ldirish
    while (bits.length % 8) bits.push(0);

    const words = [];

    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;

      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];

      words.push(byte);
    }

    // Qolgan joyni almashib turadigan to'ldiruvchi bilan to'ldiramiz
    const PAD = [0xec, 0x11];

    let index = 0;

    while (words.length < capacity) words.push(PAD[index++ % 2]);

    return words;
  }

  // Bloklarga bo'lib, EC qo'shib, aralashtirib chiqaramiz
  function interleave(words, version) {
    const [ecCount, groups] = EC_BLOCKS[version];

    const blocks = [];

    let offset = 0;

    groups.forEach(([count, size]) => {
      for (let i = 0; i < count; i++) {
        const data = words.slice(offset, offset + size);

        offset += size;

        blocks.push({ data, ec: ecCodewords(data, ecCount) });
      }
    });

    const out = [];

    const maxData = Math.max(...blocks.map((block) => block.data.length));

    for (let i = 0; i < maxData; i++) {
      blocks.forEach((block) => {
        if (i < block.data.length) out.push(block.data[i]);
      });
    }

    for (let i = 0; i < ecCount; i++) {
      blocks.forEach((block) => out.push(block.ec[i]));
    }

    return out;
  }

  // ----------------------------------------------------------
  // MATRITSA
  // ----------------------------------------------------------

  function emptyMatrix(size) {
    const rows = [];

    for (let i = 0; i < size; i++) rows.push(new Array(size).fill(null));

    return rows;
  }

  // Burchaklardagi katta kvadratlar (+ atrofidagi bo'sh chiziq)
  function setFinder(matrix, row, col) {
    const size = matrix.length;

    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const y = row + r;
        const x = col + c;

        if (y < 0 || y >= size || x < 0 || x >= size) continue;

        matrix[y][x] =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
    }
  }

  function setAlignment(matrix, version) {
    const pos = ALIGN[version];

    pos.forEach((row) => {
      pos.forEach((col) => {
        // Katta kvadratlar bilan ustma-ust tushganini o'tkazamiz
        if (matrix[row][col] !== null) return;

        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            matrix[row + r][col + c] =
              r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          }
        }
      });
    });
  }

  function setTiming(matrix) {
    const size = matrix.length;

    for (let i = 8; i < size - 8; i++) {
      const dark = i % 2 === 0;

      if (matrix[6][i] === null) matrix[6][i] = dark;
      if (matrix[i][6] === null) matrix[i][6] = dark;
    }
  }

  // Format va versiya maydonlarini band qilib qo'yamiz —
  // ma'lumot ular ustiga tushmasin
  function reserveInfo(matrix, version) {
    const size = matrix.length;

    for (let i = 0; i < 9; i++) {
      if (matrix[i][8] === null) matrix[i][8] = false;
      if (matrix[8][i] === null) matrix[8][i] = false;
    }

    for (let i = 0; i < 8; i++) {
      if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
      if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    }

    if (version >= 7) {
      for (let i = 0; i < 18; i++) {
        const row = Math.floor(i / 3);
        const col = (i % 3) + size - 11;

        matrix[row][col] = false;
        matrix[col][row] = false;
      }
    }
  }

  function maskAt(pattern, row, col) {
    switch (pattern) {
      case 0:
        return (row + col) % 2 === 0;
      case 1:
        return row % 2 === 0;
      case 2:
        return col % 3 === 0;
      case 3:
        return (row + col) % 3 === 0;
      case 4:
        return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5:
        return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6:
        return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
      default:
        return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
  }

  // Ma'lumotni ilonizi (zigzag) bo'lib joylashtiramiz
  function placeData(matrix, words, version, pattern) {
    const size = matrix.length;

    const bits = [];

    words.forEach((word) => {
      for (let i = 7; i >= 0; i--) bits.push((word >> i) & 1);
    });

    for (let i = 0; i < REMAINDER[version]; i++) bits.push(0);

    let index = 0;
    let row = size - 1;
    let up = true;

    for (let col = size - 1; col > 0; col -= 2) {
      // 6-ustun — vaqt chizig'i, uni o'tkazib yuboramiz
      if (col === 6) col--;

      for (let step = 0; step < size; step++) {
        for (let side = 0; side < 2; side++) {
          const x = col - side;

          if (matrix[row][x] !== null) continue;

          let dark = index < bits.length ? bits[index] === 1 : false;

          index++;

          if (maskAt(pattern, row, x)) dark = !dark;

          matrix[row][x] = dark;
        }

        row += up ? -1 : 1;

        if (row < 0 || row >= size) {
          row = up ? 0 : size - 1;
          up = !up;
          break;
        }
      }
    }
  }

  function placeFormat(matrix, pattern) {
    const size = matrix.length;

    const bits = FORMAT_M[pattern];

    for (let i = 0; i < 15; i++) {
      const dark = ((bits >> i) & 1) === 1;

      // chap-yuqori burchakning vertikal qismi
      if (i < 6) matrix[i][8] = dark;
      else if (i < 8) matrix[i + 1][8] = dark;
      else matrix[size - 15 + i][8] = dark;

      // chap-yuqori burchakning gorizontal qismi
      if (i < 8) matrix[8][size - i - 1] = dark;
      else if (i < 9) matrix[8][15 - i] = dark;
      else matrix[8][14 - i] = dark;
    }

    // Har doim qora bo'ladigan modul
    matrix[size - 8][8] = true;
  }

  function placeVersion(matrix, version) {
    if (version < 7) return;

    const size = matrix.length;

    const bits = VERSION_BITS[version];

    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1;

      const row = Math.floor(i / 3);
      const col = (i % 3) + size - 11;

      matrix[row][col] = dark;
      matrix[col][row] = dark;
    }
  }

  // ----------------------------------------------------------
  // NIQOB TANLASH (jarima ballari bo'yicha)
  // ----------------------------------------------------------

  function penalty(matrix) {
    const size = matrix.length;

    let score = 0;

    // 1) qatorda/ustunda 5 va undan ko'p bir xil rang
    const runScore = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;

        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) {
            run++;
          } else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1;
          }
        }

        if (run >= 5) score += 3 + (run - 5);
      }
    };

    runScore((a, b) => matrix[a][b]);
    runScore((a, b) => matrix[b][a]);

    // 2) 2x2 bir xil rangli kvadratchalar
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = matrix[r][c];

        if (
          v === matrix[r][c + 1] &&
          v === matrix[r + 1][c] &&
          v === matrix[r + 1][c + 1]
        ) {
          score += 3;
        }
      }
    }

    // 3) katta kvadratga o'xshab qoladigan naqsh
    const BAD = [
      [true, false, true, true, true, false, true, false, false, false, false],
      [false, false, false, false, true, false, true, true, true, false, true]
    ];

    const matches = (get, a, b) =>
      BAD.some((pattern) => pattern.every((cell, i) => get(a, b + i) === cell));

    for (let a = 0; a < size; a++) {
      for (let b = 0; b + 11 <= size; b++) {
        if (matches((x, y) => matrix[x][y], a, b)) score += 40;
        if (matches((x, y) => matrix[y][x], a, b)) score += 40;
      }
    }

    // 4) qora modullar ulushi 50% dan qanchalik uzoq
    let dark = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (matrix[r][c]) dark++;
    }

    const percent = (dark * 100) / (size * size);

    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  // ----------------------------------------------------------
  // ASOSIY: MATN -> MATRITSA
  // ----------------------------------------------------------

  function build(text, pattern) {
    const bytes = utf8Bytes(text);

    const version = pickVersion(bytes.length);

    if (!version) {
      throw new Error("Matn juda uzun — QR kodga sig'maydi");
    }

    const words = interleave(dataCodewords(bytes, version), version);

    const size = 17 + version * 4;

    const matrix = emptyMatrix(size);

    // Tartib muhim: katta kvadratlar -> moslashtirish -> vaqt
    setFinder(matrix, 0, 0);
    setFinder(matrix, size - 7, 0);
    setFinder(matrix, 0, size - 7);

    setAlignment(matrix, version);
    setTiming(matrix);

    reserveInfo(matrix, version);

    placeData(matrix, words, version, pattern);

    placeFormat(matrix, pattern);
    placeVersion(matrix, version);

    return matrix;
  }

  function matrix(text) {
    let best = null;
    let bestScore = Infinity;

    for (let pattern = 0; pattern < 8; pattern++) {
      const candidate = build(text, pattern);

      const score = penalty(candidate);

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  // ----------------------------------------------------------
  // SVG
  // ----------------------------------------------------------
  //
  // Qora kvadratchalar bitta <path> ichida chiziladi — shunda
  // yuzlab element o'rniga bitta element bo'ladi va katta
  // ekranda ham sekinlashmaydi.
  // ----------------------------------------------------------

  function svg(text, options) {
    const opts = options || {};

    const cells = matrix(text);

    const size = cells.length;

    // Chetidagi bo'sh maydon (standart bo'yicha 4 modul)
    const quiet = opts.quiet == null ? 4 : Number(opts.quiet);

    const total = size + quiet * 2;

    let path = "";

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!cells[r][c]) continue;

        path += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
      }
    }

    const dark = opts.dark || "#10121a";
    const light = opts.light || "#ffffff";

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      total +
      " " +
      total +
      '" shape-rendering="crispEdges" role="img" aria-label="QR kod">' +
      '<rect width="' +
      total +
      '" height="' +
      total +
      '" fill="' +
      light +
      '"/>' +
      '<path d="' +
      path +
      '" fill="' +
      dark +
      '"/>' +
      "</svg>"
    );
  }

  const ZonexQR = { matrix, svg };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ZonexQR;
  }

  root.ZonexQR = ZonexQR;
})(typeof globalThis !== "undefined" ? globalThis : this);
