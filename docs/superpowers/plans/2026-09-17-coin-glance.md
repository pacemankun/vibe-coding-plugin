# 蛋壳币价第一版实施计划（历史记录）

> 本文记录 0.1.0 的实施过程；当前功能和名称以根目录 README 为准。文件路径保留以兼容既有引用。

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review bounded tasks. User explicitly requested development in this directory and GitHub creation/push; do not ask again for these actions.

**Goal:** 完成可加载的币安工具栏行情扩展，并初始化、验证、推送新仓库。

**Architecture:** TypeScript 网络与行情核心独立于 Chrome。Service Worker 承担持久化和消息通信；React popup 订阅统一状态。

**Tech Stack:** Vite、React、TypeScript、Vitest、Playwright、Chrome Manifest V3。

**Spec:** `docs/superpowers/specs/2026-09-17-coin-glance-design.md`

## Global Constraints

- Chrome 120+；Node 22.12+；最多 20 个自选；报价 60 秒过期。
- REST 8 秒超时；网络退避与 Retry-After；20 秒协议心跳。
- 用户要求在当前目录开发；首次创建的 main 不对应任何已部署生产项目。
- 实现原创新代码；安装包分析保留本地，不提交含本机绝对路径的分析文档。

### Task 1: 数据格式与设置边界

Files: `src/shared/types.ts`, `src/shared/format.ts`, `src/shared/settings.ts`, `tests/shared.test.ts`。
Interfaces: `formatBadgePrice(price: string): string`, `formatPrice(price: string): string`, `formatChange(change: number | null): string`, `normalizeSettings(value: unknown): Settings`, `isStale(quote: Quote | undefined, now?: number): boolean`。

- [x] 先写格式测试：`expect(formatBadgePrice('0.00001234')).toBe('1e-5')`；极小价不可输出零；大价长度不超过 4。
- [x] 先写配置测试：重复自选去重、无效选中币回退、移除最后币种被拒绝、空配置默认值。
- [x] 运行 `npm test -- tests/shared.test.ts`，确认缺失行为失败，再实现并运行通过。

### Task 2: 币安行情和连接生命周期

Files: `src/market/binance.ts`, `src/market/engine.ts`, `tests/market.test.ts`, `tests/engine.test.ts`。
Interfaces: `BinanceClient.getSymbols(): Promise<MarketSymbol[]>`, `getQuotes(symbols: MarketSymbol[]): Promise<Quote[]>`；`MarketEngine` 提供 `getSnapshot`, `subscribe`, `start`, `refresh`, `setSettings`, `healthCheck`, `stop`，Chrome 通过 adapter 消费。

- [x] 写 REST 字段校验、超时、429、批量请求测试；失败保留旧价格且更新时间不前移。
- [x] 写旧响应不可覆盖新报价、断开重连、合法心跳、空行情不宣称实时的生命周期测试。
- [x] 使用可注入 fetch/socket/时钟边界，先观察失败再实现真实核心逻辑。
- [x] 运行 `npm test -- tests/market.test.ts tests/engine.test.ts`。

### Task 3: React popup（独立实现任务）

Files: `src/popup/**`, `tests/popup.test.tsx`。只修改这些文件，不修改共享接口或构建配置。
Consumes: `src/shared/types.ts` 的 `PopupBridge` / `Snapshot` / `Settings`，共享格式化函数。
Produces: `main.tsx`, `App.tsx`, `bridge.ts`, `preview.ts`, `popup.css`。

- [x] 先写用户行为测试：显示 USDT/BTC 实际报价单位、缓存标签、订阅刷新、搜索后选中详情保持、快速切换详情不被旧响应覆盖、保存配置错误可见。
- [x] 实现 400px popup，暖白背景、深墨文字、翠绿行情强调、深色主题，自选列表和大号当前角标币卡片，搜索和设置适合单手操作。
- [x] `App` 接收 `{ bridge: PopupBridge }`。Bridge 通过 runtime.sendMessage 返回 `Response<T>`，port 名称 `popup`，服务端推送 `{type:'STATE', state:Snapshot}`。处理断开重连。
- [x] 开发预览仅在 `import.meta.env.DEV` 且没有 extension runtime 时动态加载 `preview.ts`，必须显示“交互预览 · 示例数据”。
- [x] 运行 `npm test -- tests/popup.test.tsx`；完成后由独立 reviewer 检查功能与质量。

### Task 4: Chrome 适配、构建与安装说明

Files: `src/background/**`, `public/icons/*.png`, `scripts/check-build.mjs`, `scripts/package.mjs`, `tests/background.test.ts`, `README.md`, `docs/github-actions-check.yml`。

- [x] Chrome adapter 注册生命周期、message/port、storage/alarm，启动前读取缓存与配置；验证请求值，健康检查补建 alarm。
- [x] 测试 `ensureAlarm` 在任务存在时不重设、缺失时创建；角标实际币种/单位、过期状态正确。
- [x] 构建脚本验证 manifest 指向的文件存在且无远程脚本；提供 zip 产物和加载已解压扩展说明。
- [x] 提供 Node 24 自动化配置；当前凭据缺少 workflow 权限，作为模板保留，本地检查已通过，GitHub 自动执行待启用。

### Task 5: 集成验证、审查与 GitHub

Files: `tests/e2e/**`, `playwright.config.ts`, `docs/verification.md`。

- [x] Playwright 验证 popup 搜索、自选、主题、状态与订阅；加载打包扩展验证 manifest/service worker、真实 chrome.storage/action、alarm。
- [x] 在允许网络的环境检查 Binance REST/WS；记录真实成功或限制，不把示例数据当实时数据。
- [x] 独立最终代码审查，修复重要问题，执行 `npm run check` 与浏览器验证。
- [x] Git 初始化、明确文件清单暂存、提交；新建私有仓库 `pacemankun/vibe-coding-plugin`，push 并核对远端 SHA。
