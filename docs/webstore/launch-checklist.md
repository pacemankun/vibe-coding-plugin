# Chrome 应用商店首次发布清单

状态：发布资料、隐私政策网页及 ZIP 已备好；开发者账号注册与商店后台提交待完成。扩展版本 0.2.3；GitHub 源码仓库保持私有。

1. 开发者本人注册 Chrome 应用商店开发者账号，支付一次性注册费，开启 Google 账号两步验证，在后台设置发布者名称并验证联系邮箱。
2. 隐私政策网页已放入现有公开仓库 `pacemankun/pacemankun.github.com` 的 `danke-coin/privacy/` 目录，由该仓库的 GitHub Pages 自动发布。公开地址为 `https://pacemankun.github.io/danke-coin/privacy/`；把此 URL 填入开发者后台。维护源文件位于本仓库 `docs/webstore/pages/`，同步更新两个仓库时保持内容一致；插件源码仓库继续保持私有。
3. 准备商店图片：扩展内已有 128 × 128 图标；本目录 `assets/` 已备好 440 × 280 小宣传图及一张 1280 × 800 界面截图。截图由真实扩展的测试界面组成，已标注价格为测试数据。若界面改动，先运行 `npm run test:e2e` 更新截图来源，再运行 `node scripts/generate-store-assets.mjs` 重建商店图片。
4. 上传 `npm run package` 生成的 `artifacts/danke-coin-0.2.3.zip`。ZIP 根目录必须直接包含 `manifest.json`；上传前复查包内文件、版本和二维码。这个 ZIP 用于商店后台，不是本地 Chrome「加载未打包」时选择的目录。
5. 根据 [商店文案](store-listing.zh-CN.md)填写详细描述、分类、语言、隐私、单一用途、权限用途和审核测试说明。选择免费、公开，并核对展示地区。打赏是可选支持，不能描述为付费解锁。
6. 提交审核。建议选择审核通过后暂缓发布，先检查商店页面及安装体验，再手动公开。通过审核后才可能被搜索到；搜索收录可能还需数小时。

联系邮箱已确定为 `398871200@qq.com`。上线前还需开发者账号完成注册、缴费、两步验证与后台提交。不要上传个人收款截图原图；扩展 ZIP 中只含已经脱敏的二维码资源。

官方参考：[注册账号](https://developer.chrome.com/docs/webstore/register)、[设置账号](https://developer.chrome.com/docs/webstore/set-up-account)、[准备扩展](https://developer.chrome.com/docs/webstore/prepare)、[发布流程](https://developer.chrome.com/docs/webstore/publish/)、[隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[图片要求](https://developer.chrome.com/docs/webstore/images)、[公开范围](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)。
