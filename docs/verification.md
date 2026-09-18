# 首版验证记录

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
