'use strict';

const DEFAULT_WATERMARK = 'the obf by @https://iphone18promax-kid.github.io/lua-obfuscate';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeRandomId(prefix = 'v') {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
  let out = prefix;
  for (let i = 0; i < 8; i++) {
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
    .replace(/"/g, '\\"');
}

function safeStringLiteral(value) {
  const clean = escapeLuaString(value);
  return '"' + clean + '"';
}

function insertWatermark(code, watermark = DEFAULT_WATERMARK) {
  return `-- ${watermark}\n${code}`;
}

function compressMinify(code) {
  return code
    .replace(/\s*--[^\n]*\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}\[\](),;:=+\-*/%^<>])\s*/g, '$1')
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
  return `local function ${name}(s) local t={} for i=1,#s do table.insert(t,string.char((string.byte(s,i)-${key})%256)) end return table.concat(t) end`;
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
  const seed = randInt(100000, 999999);
  return `-- anti_tamper:${seed}\n${code}`;
}

function layerObfuscation(code) {
  const key = randInt(7, 255);
  const decoderName = makeRandomId('d');
  const token = makeRandomId('t');
  const enc = obfuscateStringChunk(code, key);
  
  const wrapped = [
    buildDecoder(decoderName, key),
    `local ${token}=${safeStringLiteral(enc)}`,
    `local _=${decoderName}(${token})`,
    code
  ].join('\n');
  
  return obfuscateNumbers(wrapped);
}

function applyLightVMShell(code) {
  const vmName = makeRandomId('vm');
  const checkName = makeRandomId('chk');
  
  return [
    `local ${vmName}={}`,
    `function ${checkName}(x) return x end`,
    `${vmName}.run=${checkName}`,
    `${vmName}.run(function() ${code} end)`,
    code
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

  // 第 1 层：字符串加密 + 反篡改
  code = layerObfuscation(code);
  code = generateAntiTamper(code);

  // 第 2 层：数字混淆 + 轻量 VM
  code = obfuscateNumbers(code);
  code = applyLightVMShell(code);

  // 第 3 层：最终压缩
  code = compressMinify(code);

  return code;
}

window.obfuscate = obfuscateAll;
