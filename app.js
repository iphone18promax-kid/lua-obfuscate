(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const input = $('input');
  const output = $('output');
  const inputStat = $('inputStat');
  const outputStat = $('outputStat');
  const msg = $('msg');
  const btnRun = $('btnRun');
  const btnCopy = $('btnCopy');
  const btnDownload = $('btnDownload');
  const btnClear = $('btnClear');
  const btnSample = $('btnSample');
  const fileInput = $('fileInput');

  const SAMPLE = `-- 示例：一个简单的 Lua 模块
local M = {}

function M.greet(name)
  local greeting = "Hello, " .. tostring(name) .. "!"
  print(greeting)
  return greeting
end

function M.sum(list)
  local total = 0
  for i = 1, #list do
    total = total + list[i]
  end
  return total
end

return M
`;

  let worker = null;

  function initWorker() {
    if (worker) return;
    const workerCode = `
      'use strict';
      
      ${document.querySelector('script[src="./obf3.js"]') ? 'self.onmessage = function(e) { const result = window.obfuscate(e.data.code, e.data.opts); self.postMessage({ success: true, result }); };' : ''}
      
      // Fallback: embedded obfuscation
      const DEFAULT_WATERMARK = 'the obf by @https://iphone18promax-kid.github.io/lua-obfuscate';
      
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
          .replace(/\\\\/g, '\\\\\\\\')
          .replace(/\\n/g, '\\\\n')
          .replace(/\\r/g, '\\\\r')
          .replace(/\\t/g, '\\\\t')
          .replace(/"/g, '\\\\"')
          .replace(/'/g, "\\\\'");
      }
      
      function toHex(str) {
        return Array.from(str).map(ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      }
      
      function safeStringLiteral(value) {
        const clean = escapeLuaString(value);
        return '"' + clean + '"';
      }
      
      function insertWatermark(code, watermark = DEFAULT_WATERMARK) {
        const prefix = \`-- \${watermark}\\n\`;
        return prefix + code;
      }
      
      function simpleMinifyLua(code) {
        return code
          .replace(/\\s*--.*$/gm, '')
          .replace(/\\s+/g, ' ')
          .replace(/\\s*([{}\\[\\](),;:=+\\-*/%^<>])\\s*/g, '$1')
          .replace(/\\s+\\./g, '.')
          .replace(/\\.\\s+/g, '.')
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
          \`local function \${name}(s)\`,
          \`  local out = {}\`,
          \`  local k = \${key}\`,
          \`  for i = 1, #s do\`,
          \`    local b = string.byte(s, i)\`,
          \`    table.insert(out, string.char((b - k) % 256))\`,
          \`  end\`,
          \`  return table.concat(out)\`,
          \`end\`,
        ].join('\\n');
      }
      
      function obfuscateNumbers(code) {
        return code.replace(/\\b(\\d+)\\b/g, (m, n) => {
          const val = Number(n);
          if (!Number.isSafeInteger(val) || val < 3 || val > 0x7fffffff) return m;
          const a = randInt(1, val - 2);
          const b = val - a;
          return \`(\${a}+\${b})\`;
        });
      }
      
      function generateAntiTamper(code) {
        const sig = toHex(code).slice(0, 32);
        const seed = Math.floor(Math.random() * 1000000);
        const guard = \`-- anti_tamper:\${seed}:\${sig}\\n\`;
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
            \`local \${token} = \${safeStringLiteral(enc)}\`,
            \`local _ = \${decoderName}(\${token})\`,
            \`print(_)\`,
            'local __ = _',
            out,
          ].join('\\n');
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
          \`local \${vmName} = {}\`,
          \`local \${memName} = { \${blocks.join(', ')} }\`,
          \`function \${opName}(x) return x end\`,
          \`for i = 1, #\${memName} do\`,
          \`  local v = \${memName}[i]\`,
          \`  \${vmName}[i] = \${opName}(v)\`,
          \`end\`,
          \`local _ = table.concat({\${vmName}[1], \${vmName}[2], \${vmName}[3]})\`,
          \`-- vm-stage\`,
          code,
        ].join('\\n');
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
        for (let i = 0; i < 5; i++) {
          code = layerObfuscation(code, 1);
          code = generateAntiTamper(code);
          code = applyVMStage(code);
        }
        if (options.minify !== false) {
          code = simpleMinifyLua(code);
        }
        return code;
      }
      
      self.onmessage = function(e) {
        try {
          const result = obfuscateAll(e.data.code, e.data.opts);
          self.postMessage({ success: true, result });
        } catch (err) {
          self.postMessage({ success: false, error: err.message });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
  }

  function setMsg(text, kind) {
    msg.textContent = text || '';
    msg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function updateStats() {
    inputStat.textContent = input.value.length + ' 字符';
    outputStat.textContent = output.value.length + ' 字符';
  }

  input.addEventListener('input', updateStats);
  output.addEventListener('input', updateStats);

  ['dragover', 'drop'].forEach((ev) => {
    input.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'drop') {
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }
    });
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) readFile(fileInput.files[0]);
    fileInput.value = '';
  });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      input.value = String(reader.result);
      updateStats();
      setMsg('已载入 ' + file.name, 'ok');
    };
    reader.readAsText(file);
  }

  btnSample.addEventListener('click', () => {
    input.value = SAMPLE;
    updateStats();
    setMsg('');
  });

  btnClear.addEventListener('click', () => {
    input.value = '';
    output.value = '';
    updateStats();
    setMsg('');
  });

  btnRun.addEventListener('click', () => {
    const code = input.value;
    if (!code.trim()) {
      setMsg('请先输入 Lua 代码', 'err');
      return;
    }

    btnRun.disabled = true;
    setMsg('处理中…');

    try {
      initWorker();

      const opts = {
        minify: $('optMinify').checked,
        encryptStrings: $('optStrings').checked,
        obfuscateNumbers: $('optNumbers').checked,
        watermark: $('optWatermark').value.trim(),
      };

      worker.onmessage = (e) => {
        if (e.data.success) {
          output.value = e.data.result;
          updateStats();
          setMsg('完成 ✓', 'ok');
        } else {
          setMsg(e.data.error || '混淆失败', 'err');
        }
        btnRun.disabled = false;
      };

      worker.onerror = (err) => {
        console.error(err);
        setMsg('Worker 错误: ' + err.message, 'err');
        btnRun.disabled = false;
      };

      worker.postMessage({ code, opts });
    } catch (err) {
      console.error(err);
      setMsg((err && err.message) || '混淆失败', 'err');
      btnRun.disabled = false;
    }
  });

  btnCopy.addEventListener('click', async () => {
    if (!output.value) {
      setMsg('没有可复制的内容', 'err');
      return;
    }
    try {
      await navigator.clipboard.writeText(output.value);
      setMsg('已复制到剪贴板 ✓', 'ok');
    } catch {
      try {
        output.select();
        document.execCommand('copy');
        setMsg('已复制 ✓', 'ok');
      } catch {
        setMsg('复制失败', 'err');
      }
    }
  });

  btnDownload.addEventListener('click', () => {
    if (!output.value) {
      setMsg('没有可下载的内容', 'err');
      return;
    }
    const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'obfuscated.lua';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  updateStats();
})();
