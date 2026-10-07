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

  // 拖拽文件
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

  btnRun.addEventListener('click', async () => {
    const code = input.value;
    if (!code.trim()) {
      setMsg('请先输入 Lua 代码', 'err');
      return;
    }

    btnRun.disabled = true;
    setMsg('处理中…');

    const payload = {
      code,
      options: {
        minify: $('optMinify').checked,
        encryptStrings: $('optStrings').checked,
        obfuscateNumbers: $('optNumbers').checked,
        watermark: $('optWatermark').value.trim(),
      },
    };

    try {
      const res = await fetch('/api/obfuscate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || '请求失败');
      }

      output.value = data.code;
      updateStats();
      setMsg('完成 ✓', 'ok');
    } catch (err) {
      setMsg(err.message || '出错了', 'err');
    } finally {
      btnRun.disabled = false;
    }
  });

  btnCopy.addEventListener('click', async () => {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      setMsg('已复制到剪贴板 ✓', 'ok');
    } catch {
      output.select();
      document.execCommand('copy');
      setMsg('已复制 ✓', 'ok');
    }
  });

  btnDownload.addEventListener('click', () => {
    if (!output.value) return;
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
