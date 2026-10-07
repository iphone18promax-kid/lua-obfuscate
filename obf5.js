'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { obfuscate } = require('../src/obfuscator');
const { tokenize } = require('../src/obfuscator/lexer');

test('tokenize: 基础关键字与名字', () => {
  const tokens = tokenize('local x = 1 -- 注释');
  assert.equal(tokens[0].type, 'keyword');
  assert.equal(tokens[0].value, 'local');
  assert.equal(tokens[1].type, 'name');
  assert.equal(tokens[1].value, 'x');
  assert.equal(tokens[2].value, '=');
  assert.equal(tokens[3].type, 'number');
  assert.equal(tokens[3].value, '1');
});

test('tokenize: 长字符串与长注释', () => {
  const tokens = tokenize('--[[ 多行\n注释 ]]\nlocal s = [[hello]]');
  const str = tokens.find((t) => t.type === 'string');
  assert.equal(str.value, 'hello');
});

test('tokenize: 转义字符', () => {
  const tokens = tokenize('local s = "a\\nb\\116c"');
  const str = tokens.find((t) => t.type === 'string');
  assert.equal(str.value, 'a\nbtc');
});

test('obfuscate: 字符串被加密', () => {
  const src = 'print("secret")';
  const out = obfuscate(src, { obfuscateNumbers: false });
  assert.ok(!out.includes('secret'), '明文不应出现在输出中');
  assert.ok(out.includes('string.char'), '应包含解密函数');
});

test('obfuscate: 压缩移除注释与空白', () => {
  const src = 'local  x   =   1\n-- 注释\nprint(x)';
  const out = obfuscate(src, {
    encryptStrings: false,
    obfuscateNumbers: false,
  });
  assert.ok(!out.includes('注释'));
  assert.ok(out.length < src.length);
});

test('obfuscate: 函数调用语法糖保持合法', () => {
  const out = obfuscate('print "hi"', { obfuscateNumbers: false });
  // 应变成 print(__xxx("...",key)) 而不是 print __xxx(...)
  assert.ok(!/print\s+_/.test(out), '函数调用语法糖不能破坏');
});

test('obfuscate: 减号与负数不产生注释', () => {
  const out = obfuscate('local a = 1 - -1', { obfuscateNumbers: false });
  assert.ok(!out.includes('--'), '输出中不应出现注释符');
});

test('obfuscate: 大括号与表构造', () => {
  const out = obfuscate('local t = {1, 2, 3}', { encryptStrings: false });
  assert.ok(out.includes('{'));
  assert.ok(out.includes('}'));
});
