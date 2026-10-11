'use strict';

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomName(len = 9) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  let s = '_';
  for (let i = 0; i < len; i++) {
    s += NAME_CHARS[bytes[i] % NAME_CHARS.length];
  }
  return s;
}

function encodeStringToLua(str, key) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  let out = '';
  for (const b of bytes) {
    out += '\\' + String((b + key) % 256).padStart(3, '0');
  }
  return out;
}

function buildDecryptHelper(name) {
  return (
    `local function ${name}(s,k)` +
    `local t={}` +
    `for i=1,#s do t[i]=string.char((string.byte(s,i)-k)%256)end ` +
    `return table.concat(t)end`
  );
}

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

function needsSpace(prev, next) {
  if (!prev || !next) return false;

  const a = prev.text;
  const b = next.text;
  if (!a || !b) return false;

  const last = a[a.length - 1];
  const first = b[0];

  if (WORD_CHAR.test(last) && WORD_CHAR.test(first)) return true;

  if (last === '-' && first === '-') return true;

  if (prev.type === 'number' && first === '.') return true;

  return false;
}

function obfuscate(source, options = {}) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  if (source.length > 1000000) {
    throw new Error('source too large (max 1MB)');
  }

  const opts = {
    minify: options.minify !== false,
    encryptStrings: options.encryptStrings !== false,
    obfuscateNumbers: options.obfuscateNumbers !== false,
    watermark: typeof options.watermark === 'string' ? options.watermark.trim() : '',
  };

  const tokens = window.tokenize(source);

  const decryptName = randomName();
  const key = 1 + Math.floor(Math.random() * 254);

  const out = [];
  let helperNeeded = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'eof') break;

    if (opts.encryptStrings && t.type === 'string') {
      helperNeeded = true;

      const prev = tokens[i - 1];
      const needParen =
        !!prev &&
        (prev.type === 'name' ||
          (prev.type === 'op' && (prev.value === ')' || prev.value === ']')));

      const encoded = encodeStringToLua(t.value, key);
      const call = `${decryptName}("${encoded}",${key})`;
      out.push({ type: 'raw', text: needParen ? `(${call})` : call });
      continue;
    }

    if (opts.obfuscateNumbers && t.type === 'number') {
      const encoded = encodeNumber(t.value);
      if (encoded) {
        out.push({ type: 'raw', text: encoded });
        continue;
      }
    }

    if (t.type === 'string') {
      out.push({ type: 'string', text: t.raw });
    } else {
      out.push({ type: t.type, text: t.value });
    }
  }

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

window.obfuscate = obfuscate;
