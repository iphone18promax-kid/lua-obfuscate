Lua Obfuscator — 在线 Lua 代码混淆工具

一个轻量级的在线 Lua 代码混淆服务，支持字符串加密、数字混淆、代码压缩和水印添加。前端纯静态，后端基于 Node.js + Express，可本地运行或 Docker 部署。

功能特性

· 字符串加密：将明文字符串转为 \ddd 转义序列，并自动注入解密函数。
· 数字混淆：将安全范围内的十进制整数拆分为加法表达式（如 42 → (17+25)）。
· 代码压缩：移除注释、多余空白，同时保证语法正确（自动处理 --、数字与 . 等歧义）。
· 水印：在输出末尾添加自定义注释。
· 文件拖拽/选择：支持直接拖入 .lua 文件或点击选择。
· 复制/下载：一键复制结果或下载为 obfuscated.lua。
· API 接口：提供 /api/obfuscate POST 接口，方便集成到其他工具。
· 基础限流：内存级限流，防止滥用（每分钟 60 次/IP）。
· Docker 支持：提供 Dockerfile，一键构建运行。

技术栈

· 前端：原生 HTML / CSS / JavaScript
· 后端：Node.js 18+、Express 4
· 测试：Node.js 内置 node:test
· 容器：Docker / Alpine

目录结构

```
.
├── server.js                 # Express 入口，API 与静态文件服务
├── src/
│   └── obfuscator/
│       ├── index.js          # 混淆主逻辑
│       └── lexer.js          # Lua 词法分析器
├── public/
│   ├── index.html            # 前端页面
│   ├── style.css             # 样式
│   └── app.js                # 前端交互逻辑
├── test/
│   └── obfuscator.test.js    # 单元测试
├── package.json
├── Dockerfile
├── .dockerignore
├── .gitignore
└── README.md
```

环境要求

· Node.js >= 18
· npm 或 yarn
· （可选）Docker

快速开始（本地）

1. 克隆仓库并进入目录：
   ```bash
   git clone <你的仓库地址>
   cd lua-obfuscator
   ```
2. 安装依赖：
   ```bash
   npm install
   ```
3. 启动服务：
   ```bash
   npm start
   ```
   或开发模式（自动重启）：
   ```bash
   npm run dev
   ```
4. 打开浏览器访问：
   ```
   http://localhost:3000
   ```

Docker 部署

1. 构建镜像：
   ```bash
   docker build -t lua-obfuscator .
   ```
2. 运行容器：
   ```bash
   docker run -d -p 3000:3000 --name lua-obfuscator lua-obfuscator
   ```
3. 访问 http://localhost:3000。

环境变量

变量名 默认值 说明
PORT 3000 服务监听端口

API 接口

POST /api/obfuscate

请求体（JSON）：

```json
{
  "code": "print('hello')",
  "options": {
    "minify": true,
    "encryptStrings": true,
    "obfuscateNumbers": true,
    "watermark": "© yourname"
  }
}
```

· code：必填，Lua 源码字符串。
· options：可选，各字段默认均为 true（watermark 默认为空字符串）。
  · minify：是否压缩代码。
  · encryptStrings：是否加密字符串。
  · obfuscateNumbers：是否混淆数字。
  · watermark：水印文本，会以注释形式追加到输出末尾。

成功响应：

```json
{
  "ok": true,
  "code": "-- 混淆后的 Lua 代码"
}
```

错误响应：

```json
{
  "error": "错误描述"
}
```

HTTP 状态码：400 参数错误，429 请求过于频繁，500 服务器内部错误。

GET /healthz

健康检查，返回 { "ok": true, "uptime": ... }。

混淆选项详解

· 压缩代码：移除注释和多余空白，但会保留必要的空格（如 local x 不会变成 localx）。
· 加密字符串：将字符串内容按字节加上随机密钥后，以 \ddd 形式写入，并生成一个局部解密函数。字符串字面量会被替换为解密函数调用，保证运行时还原。
· 数字混淆：仅处理安全的十进制整数（3 ~ 0x7fffffff），将其拆成 (a+b) 形式。浮点数、十六进制、科学计数法保持不变。
· 水印：在输出末尾添加 -- 你的文本，不影响代码执行。

测试

运行单元测试：

```bash
npm test
```

测试覆盖词法分析、字符串加密、压缩、语法糖处理、减号歧义等场景。

常见问题与限制

· 源码大小：限制 1MB，超出会返回错误。
· 语法支持：词法分析覆盖 Lua 5.1 ~ 5.4 的常见语法，但未做完整 AST 解析，极端写法可能无法完美处理。
· 字符串加密：不会加密长字符串 [[...]] 中的内容？实际上会加密，但长字符串会被当作普通字符串处理，输出为短字符串形式，语义等价。
· 数字混淆：不会处理负数、浮点数、十六进制，这些保持原样。
· 安全性：混淆仅用于增加阅读难度，并非强加密，请勿用于保护敏感密钥。
· 限流：默认每 IP 每分钟 60 次，如需调整可修改 server.js 中的 rateLimit 参数。

许可证

MIT
