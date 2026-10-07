'use strict';

/**
 * Lua 词法分析器
 * 支持 Lua 5.1 ~ 5.4 的词法元素：
 *   - 行注释 / 长注释
 *   - 短字符串（含全部转义）/ 长字符串
 *   - 十进制 / 十六进制 / 科学计数法数字
 *   - 名字 / 关键字 / 运算符
 */

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
  'then', 'true', 'until', 'while',
]);

// 顺序非常重要：长运算符必须排在短的之前
const PUNCT = [
  '...', '..', '::', '<<', '>>', '//', '==', '~=', '<=', '>=',
  '+', '-', '*', '/', '%', '^', '#', '&', '~', '|', '<', '>',
  '=', '(', ')', '{', '}', '[', ']', ';', ':', ',', '.',
];

const isDigit = (c) => c >= '0' && c <= '9';
const isHex = (c) =>
  isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
const isAlpha = (c) =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isAlnum = (c) => isAlpha(c) || isDigit(c);

/**
 * 检查 src[i] 是否是一个长括号的起始位置
 * 返回 '=' 的数量，不是则返回 -1
 */
function longBracketLevel(src, i) {
  if (src[i] !== '[') return -1;
  let j = i + 1;
  let level = 0;
  while (src[j] === '=') {
    level++;
    j++;
  }
  if (src[j] !== '[') return -1;
  return level;
}

/**
 * @param {string} src
 * @returns {Array<{type:string, value:string, raw:string, line:number}>}
 */
function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let line = 1;

  const push = (type, value, raw, startLine) => {
    tokens.push({ type, value, raw, line: startLine });
  };

  while (i < n) {
    const c = src[i];

    // ---- 空白 ----
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }

    const startLine = line;

    // ---- 注释 ----
    if (c === '-' && src[i + 1] === '-') {
      i += 2;
      // 长注释 --[[ ... ]] / --[==[ ... ]==]
      if (src[i] === '[') {
        const level = longBracketLevel(src, i);
        if (level >= 0) {
          const close = ']' + '='.repeat(level) + ']';
          i += level + 2;
          const end = src.indexOf(close, i);
          const content = end === -1 ? src.slice(i) : src.slice(i, end);
          line += (content.match(/\n/g) || []).length;
          i = end === -1 ? n : end + close.length;
          continue;
        }
      }
      // 行注释
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // ---- 长字符串 [[ ... ]] ----
    if (c === '[') {
      const level = longBracketLevel(src, i);
      if (level >= 0) {
        const start = i;
        const close = ']' + '='.repeat(level) + ']';
        i += level + 2;
        const end = src.indexOf(close, i);
        const content = end === -1 ? src.slice(i) : src.slice(i, end);
        line += (content.match(/\n/g) || []).length;
        i = end === -1 ? n : end + close.length;
        push('string', content, src.slice(start, i), startLine);
        continue;
      }
    }

    // ---- 短字符串 ----
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      let j = i + 1;
      let val = '';

      while (j < n) {
        const ch = src[j];

        if (ch === '\\') {
          const nxt = src[j + 1];

          switch (nxt) {
            case 'n': val += '\n'; break;
            case 't': val += '\t'; break;
            case 'r': val += '\r'; break;
            case 'a': val += '\x07'; break;
            case 'b': val += '\b'; break;
            case 'f': val += '\f'; break;
            case 'v': val += '\v'; break;
            case '\\': val += '\\'; break;
            case '"': val += '"'; break;
            case "'": val += "'"; break;
            case '\n': val += '\n'; line++; break;

            case 'x': {
              const hex = src.substr(j + 2, 2);
              val += String.fromCharCode(parseInt(hex, 16) || 0);
              j += 2;
              break;
            }

            case 'z': {
              // \z 跳过后续所有空白
              j += 1;
              while (j < n && /\s/.test(src[j])) {
                if (src[j] === '\n') line++;
                j++;
              }
              continue;
            }

            default:
              if (isDigit(nxt)) {
                let num = '';
                let k = j + 1;
                while (k < n && isDigit(src[k]) && num.length < 3) {
                  num += src[k];
                  k++;
                }
                val += String.fromCharCode(parseInt(num, 10) % 256);
                j = k - 2; // 之后统一 +2，最终落在 k
              } else {
                val += nxt;
              }
          }

          j += 2;
          continue;
        }

        if (ch === quote) break;
        if (ch === '\n') line++;
        val += ch;
        j++;
      }

      push('string', val, src.slice(start, j + 1), startLine);
      i = j + 1;
      continue;
    }

    // ---- 数字 ----
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const start = i;

      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        i += 2;
        while (i < n && (isHex(src[i]) || src[i] === '.')) i++;
        if (src[i] === 'p' || src[i] === 'P') {
          i++;
          if (src[i] === '+' || src[i] === '-') i++;
          while (i < n && isDigit(src[i])) i++;
        }
      } else {
        let seenDot = false;
        while (i < n) {
          if (isDigit(src[i])) {
            i++;
          } else if (src[i] === '.' && !seenDot && src[i + 1] !== '.') {
            seenDot = true;
            i++;
          } else {
            break;
          }
        }
        if (src[i] === 'e' || src[i] === 'E') {
          i++;
          if (src[i] === '+' || src[i] === '-') i++;
          while (i < n && isDigit(src[i])) i++;
        }
      }

      const raw = src.slice(start, i);
      push('number', raw, raw, startLine);
      continue;
    }

    // ---- 名字 / 关键字 ----
    if (isAlpha(c)) {
      const start = i;
      while (i < n && isAlnum(src[i])) i++;
      const word = src.slice(start, i);
      push(KEYWORDS.has(word) ? 'keyword' : 'name', word, word, startLine);
      continue;
    }

    // ---- 运算符 ----
    let matched = null;
    for (const p of PUNCT) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }

    if (matched) {
      push('op', matched, matched, startLine);
      i += matched.length;
      continue;
    }

    // 未知字符，原样保留
    push('op', c, c, startLine);
    i++;
  }

  push('eof', '', '', line);
  return tokens;
}

module.exports = { tokenize, KEYWORDS };
