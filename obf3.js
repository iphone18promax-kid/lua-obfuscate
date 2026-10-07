'use strict';

const crypto = require('crypto');
const { tokenize } = require('./lexer');

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 生成一个几乎不可能与用户代码冲突的局部名字 */
function randomName(len = 9) {
  const bytes = crypto.randomBytes(len);
  let s = '_';
  for (let i = 0; i < len; i++) {
    s += NAME_CHARS[bytes[i] % NAME_CHARS.length];
  }
  return s;
}

/**
 * 把字符串编码成 Lua 的 \ddd 转义序列
 * 加密方式： e = (b + key) % 256 ，解密 (e - key) % 256
 */
function encodeStringToLua(str, key) {
  const bytes = Buffer.from(str, 'utf8');
  let out = '';
  for (const b of bytes) {
    out += '\\' + String((b + key) % 256).padStart(3, '0');
  }
  return out;
}

/** 生成解密函数定义 */
function buildDecryptHelper(name) {
  return (
    `local function ${name}(s,k)` +
    `local t={}` +
    `for i=1,#s do t[i]=string.char((string.byte(s,i)-k)%256)end ` +
    `return table.concat(t)end`
  );
}

/** 数字混淆：只处理安全的十进制整数 */
function encodeNumber(raw) {
  if (!/^[0-9]+$/.test(raw)) return null;

  const n = parseInt(raw, 10);
  if (!Number.isSafeInteger(n)) return null;
  if (n < 3 || n > 0x7fffffff) return null;

  const a = 1 + Math.floor(Math.random() * (n - 2));
  const b = n - a;
  return `(${a}+${b})`;
}

const WORD_CHAR = /[A-Za-z0-9_]/;

/** 判断两个 token 拼接时是否需要插入空格 */
function needsSpace(prev, next) {
  if (!prev || !next) return false;

  const a = prev.text;
  const b = next.text;
  if (!a || !b) return false;

  const last = a[a.length - 1];
  const first = b[0];

  // 两个词法单元黏在一起会变成一个
  if (WORD_CHAR.test(last) && WORD_CHAR.test(first)) return true;

  // 避免拼出 "--" 注释
  if (last === '-' && first === '-') return true;

  // 避免数字后面直接跟 '.'，如 1 .. 2 被写成 1..2
  if (prev.type === 'number' && first === '.') return true;

  return false;
}

/**
 * 主入口
 * @param {string} source Lua 源码
 * @param {object} options
 * @returns {string} 混淆后的 Lua 源码
 */
function obfuscate(source, options = {}) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  if (source.length > 1_000_000) {
    throw new Error('source too large (max 1MB)');
  }

  const opts = {
    minify: options.minify !== false,
    encryptStrings: options.encryptStrings !== false,
    obfuscateNumbers: options.obfuscateNumbers !== false,
    watermark: typeof options.watermark === 'string' ? options.watermark.trim() : '',
  };

  const tokens = tokenize(source);

  const decryptName = randomName();
  const key = 1 + Math.floor(Math.random() * 254);

  /** @type {Array<{type:string, text:string}>} */
  const out = [];
  let helperNeeded = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'eof') break;

    // ---- 字符串加密 ----
    if (opts.encryptStrings && t.type === 'string') {
      helperNeeded = true;

      const prev = tokens[i - 1];
      // 如果前一个 token 可能构成"函数调用语法糖"（f "str"），需要加括号
      const needParen =
        !!prev &&
        (prev.type === 'name' ||
          (prev.type === 'op' && (prev.value === ')' || prev.value === ']')));

      const encoded = encodeStringToLua(t.value, key);
      const call = `${decryptName}("${encoded}",${key})`;
      out.push({ type: 'raw', text: needParen ? `(${call})` : call });
      continue;
    }

    // ---- 数字混淆 ----
    if (opts.obfuscateNumbers && t.type === 'number') {
      const encoded = encodeNumber(t.value);
      if (encoded) {
        out.push({ type: 'raw', text: encoded });
        continue;
      }
    }

    // ---- 原样保留 ----
    if (t.type === 'string') {
      out.push({ type: 'string', text: t.raw });
    } else {
      out.push({ type: t.type, text: t.value });
    }
  }

  // ---- 拼接 ----
  let body = '';
  let prev = null;

  for (const tok of out) {
    if (opts.minify) {
      if (prev && needsSpace(prev, tok)) body += ' ';
      body += tok.text;
    } else {
      if (prev && needsSpace(prev, tok)) body += ' ';
      body += tok.text;
      body += ' ';
    }
    prev = tok;
  }

  if (!opts.minify) body = body.trim();

  const parts = [];
  if (helperNeeded) parts.push(buildDecryptHelper(decryptName));
  parts.push(body);

  let result = parts.join('\n');
  if (opts.watermark) {
    result += '\n-- ' + opts.watermark.replace(/[\r\n]+/g, ' ');
  }

  return result;
}

module.exports = { obfuscate };
