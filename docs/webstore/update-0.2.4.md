# 0.2.4 商店更新：移除网站访问提示

Chrome 安装 0.2.3 时显示“读取和更改您在 data-api.binance.vision 和 fapi.binance.com 上的数据”，原因是该版 `manifest.json` 声明了这两个域名的 `host_permissions`。这段提示由 Chrome 生成，不能自定义措辞。0.2.4 删除了这两项权限，保留本机存储和后台定时检查所需的 `storage`、`alarms`。`connect-src` 仍只允许连接币安的四个公开 REST / WebSocket 端点；它是内容安全策略，不是网站访问权限。

币安的公开 REST 接口目前允许浏览器跨域读取，扩展以不携带凭据的 GET 请求访问。已在隔离 Chromium 中实测现货和 USDT 永续的币对搜索、REST 行情、WebSocket 推送和角标。此方案依赖币安继续提供跨域访问；若币安将来关闭该能力，搜索和 REST 补数可能失效，需要再评估数据源与权限取舍。

用户验收 0.2.4 的 `dist` 后，运行 `npm run package` 生成 `artifacts/danke-coin-0.2.4.zip`。在**现有**蛋壳币价商品（ID：`bkaccnchcfdlaocphclnhadjnhhcfkde`）上传新版本，更新商店后台的权限用途说明：只说明 `storage` 和 `alarms`，不要再填写两项币安网站权限。现有商品的描述、隐私政策和截图应按实际内容复查；提交审核并等待新版发布。商店仍在分发 0.2.3 时，新用户仍会看到原提示。新版发布后，Chrome 仍会显示通常的“添加扩展程序”确认框，但不应再列出这条“读取和更改网站数据”的权限。
