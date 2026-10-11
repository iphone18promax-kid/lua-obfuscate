'use strict';

const DEFAULT_WATERMARK = 'the obf by @https://iphone18promax-kid.github.io/lua-obfuscate';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeRandomId(prefix = 'v') {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
  let out = prefix;
  for (let i = 0; i < 10; i++) {
    out += chars[randInt(0, chars.length - 1)];
  }
  return out;
}

function escapeLuaString(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

function toHex(str) {
  return Array.from(str).map(ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function safeStringLiteral(value) {
  const clean = escapeLuaString(value);
  return '"' + clean + '"';
}

function insertWatermark(code, watermark = DEFAULT_WATERMARK) {
  const prefix = `-- ${watermark}\n`;
  return prefix + code;
}

function simpleMinifyLua(code) {
  return code
    .replace(/\s*--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}\[\](),;:=+\-*/%^<>])\s*/g, '$1')
    .replace(/\s+\./g, '.')
    .replace(/\.\s+/g, '.')
    .replace(/\s+\|\|\s+/g, ' || ')
    .replace(/\s+&&\s+/g, ' && ')
    .trim();
}

function obfuscateStringChunk(str, key) {
  const bytes = Array.from(str).map(ch => ch.charCodeAt(0));
  const out = [];
  for (const byte of bytes) {
    out.push(String((byte + key) % 256).padStart(3, '0'));
  }
  return out.join('');
}

function buildDecoder(name, key) {
  return [
    `local function ${name}(s)`,
    `  local out = {}`,
    `  local k = ${key}`,
    `  for i = 1, #s do`,
    `    local b = string.byte(s, i)`,
    `    table.insert(out, string.char((b - k) % 256))`,
    `  end`,
    `  return table.concat(out)`,
    `end`,
  ].join('\n');
}

function obfuscateNumbers(code) {
  return code.replace(/\b(\d+)\b/g, (m, n) => {
    const val = Number(n);
    if (!Number.isSafeInteger(val) || val < 3 || val > 0x7fffffff) return m;
    const a = randInt(1, val - 2);
    const b = val - a;
    return `(${a}+${b})`;
  });
}

function generateAntiTamper(code) {
  const sig = toHex(code).slice(0, 32);
  const seed = Math.floor(Math.random() * 1000000);
  const guard = `-- anti_tamper:${seed}:${sig}\n`;
  return guard + code;
}

function layerObfuscation(code, depth = 1) {
  let out = code;
  for (let i = 0; i < depth; i++) {
    const key = randInt(7, 255);
    const decoderName = makeRandomId('d');
    const token = makeRandomId('t');
    const enc = obfuscateStringChunk(out, key);
    out = [
      buildDecoder(decoderName, key),
      `local ${token} = ${safeStringLiteral(enc)}`,
      `local _ = ${decoderName}(${token})`,
      `print(_)`,
      'local __ = _',
      out,
    ].join('\n');
    out = obfuscateNumbers(out);
    out = simpleMinifyLua(out);
  }
  return out;
}

function applyVMStage(code) {
  const vmName = makeRandomId('vm');
  const memName = makeRandomId('m');
  const opName = makeRandomId('op');
  const px = toHex(code);
  const blocks = [];
  for (let i = 0; i < px.length; i += 4) {
    blocks.push('0x' + px.slice(i, i + 4));
  }

  return [
    `local ${vmName} = {}`,
    `local ${memName} = { ${blocks.join(', ')} }`,
    `function ${opName}(x) return x end`,
    `for i = 1, #${memName} do`,
    `  local v = ${memName}[i]`,
    `  ${vmName}[i] = ${opName}(v)`,
    `end`,
    `local _ = table.concat({${vmName}[1], ${vmName}[2], ${vmName}[3]})`,
    `-- vm-stage`,
    code,
  ].join('\n');
}

function obfuscateAll(source, options = {}) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }

  const watermark = typeof options.watermark === 'string' && options.watermark.trim()
    ? options.watermark.trim()
    : DEFAULT_WATERMARK;

  let code = source;
  code = insertWatermark(code, watermark);

  // 只保留 3 层混淆
  for (let i = 0; i < 3; i++) {
    code = layerObfuscation(code, 1);
    code = generateAntiTamper(code);
    code = applyVMStage(code);
  }

  if (options.minify !== false) {
    code = simpleMinifyLua(code);
  }

  return code;
}

window.obfuscate = obfuscateAll;
