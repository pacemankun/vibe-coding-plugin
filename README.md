# 蛋壳币价

<img src="public/icons/128.png" alt="蛋壳币价柴犬图标" width="80" height="80">

蛋壳币价（Danke Coin）是在 Chrome 工具栏显示币安现货与 USDT 永续价格的 Manifest V3 扩展。React + TypeScript + Vite，无后端、无需 API Key。

## 安装与使用

需要 Node.js 22.12+（建议 24）和 Chrome 120+。

```sh
npm ci
npm run build
```

1. 打开 `chrome://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择项目的 `dist` 文件夹。
3. 在 Chrome 扩展菜单中将「蛋壳币价」固定到工具栏。
4. 点击图标管理自选、切换角标关注币对和显示偏好。鼠标悬停图标可查看完整价格、计价币种和更新时间。

日常更新只需执行 `npm run build`，再到扩展管理页点击「重新加载」，继续使用原来的 `dist`。仅在需要分享或归档时执行 `npm run package`，生成 `artifacts/danke-coin-0.2.1.zip`；ZIP 必须先解压，再加载解压后的目录。0.2.0 新增币安合约行情域名权限，Chrome 如提示权限变更，需要确认后重新启用。旧版自选与设置保留。

查看 BTW：点击「添加币对」→「USDT 永续」→ 搜索 `BTW` 或 `BTWUSDT` → 选择 `BTW/USDT` →「固定到角标」。合约展示**最新成交价**，不是标记价格。现货与永续可同时加入自选，同名币对分别保存，不会互相覆盖。

## 当前功能（0.2.1）

- 默认关注 BTC、ETH 等 10 个 USDT 交易对，最多 20 个自选，至少保留 1 个。
- 透明柴犬头像；工具栏价格或 24 小时涨跌幅统一显示 4 个字符，支持固定币对、5 / 10 / 15 秒轮换。
- 现货与 USDT 永续分市场搜索、详情、加入 / 移除自选、固定到角标，准确展示市场和计价单位。
- 浅色 / 深色 / 跟随系统，涨绿跌红或涨红跌绿。
- WebSocket 推送，REST 批量补数；断线重连、限流退避、请求超时、旧响应防覆盖。
- 断网保留最后价格；超过 60 秒显示缓存状态，角标变灰，悬浮说明包含更新时间。

角标固定显示 4 个字符：小数补末尾零（`.600`、`1.20`），整数不足时前置补零（`076k` 表示约 76,000），不改变数量级；`1e-5` 表示约 0.00001。无报价显示 `----`，连接中显示 `....`。Chrome 原生角标没有宽度或对齐 API，固定字符数不保证各系统的像素宽度完全一致。极端数值显示 `TINY` / `HUGE`，完整价格以悬浮说明和详情为准。涨跌幅角标省略 `%`，绝对值达到 100% 时显示 `+99+` / `-99+`。USDT 是实际计价资产，界面不会把它替换成美元符号。轮换时当前币对以图标悬浮说明为准。

详情中的非自选币对是打开时的快照，加入自选后持续订阅；未加入自选的详情超过 60 秒会显示缓存。当前版本不包含交易、账户连接、币本位或交割合约、提醒或资产管理。

标题旁的「投喂蛋壳」（支持开发）入口会直接打开紧凑的打赏弹窗，提供微信、支付宝和 USDT 三种自愿打赏方式。三个二维码均由用户提供的原码重新生成，只保留黑白二维码，不包含原截图中的姓名、头像或平台文案；原截图不进入仓库或扩展包。USDT 仅支持截图提供的 ERC20 (Ethereum) 地址；截图当时标注最低充值 0.5 USDT，转账前请重新核对收款平台显示的最新地址和最低限额。打赏功能不请求额外扩展权限，也不通过插件处理支付。扫码进入支付平台后，对方平台仍可能显示收款账户名称，插件无法隐藏该平台信息。

## 数据与权限

扩展只申请 `storage`、`alarms` 和币安公开行情域名权限，不读取浏览历史、不注入网页、不收集账户或身份数据。设置、币对目录与最近行情保存在本机 `chrome.storage.local`。

- REST：`https://data-api.binance.vision/api/v3/`，使用 `exchangeInfo` 与批量 `ticker/24hr`。
- WebSocket：`wss://data-stream.binance.vision:443/stream`，订阅自选的 `@ticker`（约每秒推送）。
- 合约 REST：`https://fapi.binance.com/fapi/v1/`，使用 `exchangeInfo` 和单币 `ticker/24hr?symbol=...`，最多 4 个并发；仅纳入交易中的 USDT 结算永续。
- 合约 WebSocket：`wss://fstream.binance.com/market/stream`，订阅 `@ticker`（约每两秒推送）。两个市场独立缓存、限流和重连，互不混价。
- 每 20 秒发送合法的订阅查询作为连接保活；Chrome alarm 每 30 秒检查恢复，后台启动时补建缺失 alarm。
- 行情缓存最多每 15 秒写入一次，弹窗和角标更新最多约每秒一次。低活跃交易对可能依靠 REST 补齐。

浏览器完全退出、系统休眠或网络无法访问币安时不能持续更新；恢复后自动尝试连接。Chrome 的后台调度不是硬实时保证。限流时遵循 `Retry-After`，不会通过切换域名绕过限制。

参考：[币安公开行情接口](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only)、[WebSocket streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)、[Chrome service worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。

## 开发与验证

```sh
npm run dev          # 浏览器打开 /popup.html；明确标注示例数据的交互预览
npm run check        # TypeScript、单元/组件测试、生产构建与资源检查
npx playwright install chromium
npm run test:e2e     # 隔离 Chromium 配置中加载真正的扩展，使用可复现行情
node scripts/live-smoke.mjs # 可选：验证本机真实币安连接，需要网络，不在 CI 中执行
node scripts/live-smoke.mjs --usdm # 可选：实际搜索 BTW 永续、固定角标并验证实时推送
npm run build       # 日常构建：更新 dist，不生成 ZIP
npm run package     # 可选：分享 / 归档 ZIP，需要系统 zip 命令
```

源码分为 `src/shared`（设置、精度、消息类型）、`src/market`（请求与连接状态）、`src/background`（Chrome 生命周期 / 角标 / 存储）、`src/popup`（React 界面）。后台是唯一行情源，弹窗通过消息与 port 订阅快照。生产包不包含预览行情。

图标使用用户提供的柴犬图片，原图位于 `assets/brand/shiba.jpg`，透明头部图位于 `assets/brand/shiba-head.png`（使用内置 imagegen 去除布料、拉链和背景，保留柴犬头部）。运行 `node scripts/generate-icons.mjs` 可重建保留透明通道的 PNG 图标。实现参考「章鱼查币价」的使用方式并修复其可复现问题，没有复制该扩展源码或图标。见 [改进记录](docs/reference-notes.md) 与 [验证记录](docs/verification.md)。

## GitHub 自动检查

CI 配置保存在 [docs/github-actions-check.yml](docs/github-actions-check.yml)，目前作为模板提供，尚未启用。首次上传使用的 GitHub OAuth 凭据没有 `workflow` 权限，GitHub 因此拒绝直接上传工作流文件；现有 SSH 也尚未配置成功。具备相应权限后，将模板移至 `.github/workflows/check.yml` 并提交，即可在 push / PR 时运行类型检查、测试、构建和浏览器集成测试。本地验证不依赖此权限。

## 维护约定

统一产品名称为「蛋壳币价」，英文辅助名称为「Danke Coin」。仓库和 npm 工程标识保留 `vibe-coding-plugin`；历史文档路径和后台 alarm 标识保留以兼容现有引用与安装。产品改名、图标和版本变更需要检查扩展元数据、界面、README、GitHub 简介、文档和构建产物，具体见 [AGENTS.md](AGENTS.md)。
