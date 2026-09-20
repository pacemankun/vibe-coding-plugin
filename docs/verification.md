# 蛋壳币价验证记录

## 0.2.2：可取消固定与无角标状态

修复分支 `fix/optional-badge-pinning` 验证：80 项单元 / 组件测试、3 项 Chromium 扩展集成测试，以及类型检查、生产构建和资源检查通过。新增覆盖首次安装不自动固定、固定按钮切换、取消固定失败保留原状态、移除已固定币对清空选择、无选择禁止轮播、关闭轮播、多弹窗同步、刷新与浏览器重启后保留取消状态。真实扩展测试使用 `chrome.action.getBadgeText()` 确认取消后返回空字符串，自选报价继续显示。

已检查未固定状态和已固定按钮截图。0.2.1 的有效选择会继续保留，用户可点击「已固定 · 点击取消」清除；无固定选择时不自动回退到第一个币对。此次仅构建 dist，未生成 ZIP。

## 0.2.1：蛋壳币价、透明柴犬头像与四字符角标

2026-09-19 验证：75 项单元 / 组件测试、3 项 Chromium 扩展集成测试通过；TypeScript、生产构建和 Manifest / 资源检查通过。四种尺寸的柴犬 PNG 已检查透明背景。覆盖补零、价格数量级、小数进位、缺失涨跌幅等边界。PR #2 已合入 main，并从 main 重新构建 dist。

Chrome 原生角标未提供像素宽度和对齐 API；实现保证四个字符，不能保证不同系统的像素宽度完全相同。

## 0.2.0：现货与 USDT 永续

2026-09-18 合约功能验证：`npm run check` 通过 58 项单元 / 组件测试、类型检查与生产构建；`npm run test:e2e` 通过 3 项浏览器集成测试。新增覆盖 BTW 合约搜索与角标、同名现货 / 永续价格隔离、不同市场连接与限流隔离，以及同时请求的并发上限。独立复审确认后台断连时各市场同步离线、慢市场不阻塞正常市场首个 REST 结果发布；相关回归已加入。

`node scripts/live-smoke.mjs --usdm` 在真实生产扩展中完成搜索 BTW、固定到角标和持续推送验证，结果为 `status: live`、`instrument: BTWUSDT`、`market: usdm`、`source: stream`、11 个报价、无页面运行错误。记录时角标为 `.686`，只是验证当时的近似价格。

浏览器访问币安合约目录确认 BTWUSDT 的状态为 `TRADING`，类型 `PERPETUAL`，quoteAsset / marginAsset 均为 USDT。终端直连 fapi 在该网络下超时，浏览器实际访问成功；以浏览器扩展联网结果为准。测试用 fapi JSON 页面自身 CSP 禁止连接其他 WebSocket 源，最终通过扩展自身 CSP 和实际行情订阅验证，合约推送成功。

安装时继续使用项目 `dist` 文件夹，在 Chrome 扩展管理页点击重新加载；若出现新增合约域名的权限提示，需要确认启用。

以下为 0.1.0 留存的验证记录。

验证日期：2026-09-18。测试在隔离的 Chromium 配置中进行，没有修改日常使用的 Chrome 配置。

## 本地自动验证

- `npm ci --registry=https://registry.npmjs.org`：官方源可重现安装通过，依赖版本和完整性由锁文件固定。
- `npm run check`：TypeScript、42 项 Vitest 测试、Vite 生产构建和 Manifest / 资源校验通过。
- `npm run test:e2e`：2 个真实 MV3 扩展集成测试通过。
- 集成测试使用可复现的 REST 响应，断开 WebSocket，不依赖币安价格变化；测试真实 `chrome.runtime`、`storage`、`action`、`alarms`。
- 覆盖工具栏角标与计价币种、搜索和固定币对、两个弹窗同步、主题持久化、失败后保留报价，以及浏览器进程重启后的过期缓存展示、设置恢复和缺失 alarm 补建。

## 真实网络验证

`node scripts/live-smoke.mjs` 在生产扩展中直接连接币安公开域名，没有注入示例报价或修改网络响应。一次成功输出为：

```json
{
  "status": "live",
  "quotes": 10,
  "streamedQuotes": 4,
  "badge": "77k",
  "alarm": 0.5,
  "pageErrors": []
}
```

这里的 `77k` 是验证当时的近似角标值，不是当前报价。另有独立 WebSocket 检查收到连续两个有效的 `BTCUSDT` / `24hrTicker` 消息。

已检查 `artifacts/popup-live.png` 浅色实时界面及 `artifacts/popup-dark-offline.png` 深色断网界面，400 × 600 视口无横向溢出。截图为本地产物，不随源码提交。

## 审查与边界

独立审查覆盖行情核心、旧响应隔离、缓存、设置保存、MV3 生命周期、最小权限和 CSP。弹窗审查提出的断线“实时”误标及旧请求覆盖新推送问题已修复，并加入回归测试。最终审查提出的首次断网后目录无法重试问题也已修复并通过复核。

以上证明本次构建和测试场景通过；未进行连续 24 小时运行或跨地区网络可达性测试。浏览器休眠、操作系统退出与币安接口不可达时仍依赖恢复机制，不能保证硬实时。扩展尚未发布到 Chrome 应用商店。

GitHub CI 尚未启用：当前 OAuth 凭据缺少 `workflow` 权限，SSH 认证不可用。工作流保留在 `docs/github-actions-check.yml`，待具备权限后移入 `.github/workflows/`。上述自动验证均为本地结果，不代表 GitHub Actions 已运行。
