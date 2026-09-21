# Chrome 应用商店首次发布清单

状态：开发者账号已注册并缴费，0.2.3 文件包已上传为商店草稿（ID：`bkaccnchcfdlaocphclnhadjnhhcfkde`）。商品详情、隐私申报及审核测试说明已保存；发布者联系邮箱已填写并发送验证邮件，等待邮箱所有人点击验证链接。尚未提交审核；GitHub 源码仓库保持私有。

1. 开发者账号注册和一次性注册费支付已完成；核对 Google 账号两步验证。发布者联系邮箱已填写，验证邮件已发送，需由邮箱所有人在链接有效期内完成验证；过期则重新发送。
2. 隐私政策网页已放入现有公开仓库 `pacemankun/pacemankun.github.com` 的 `danke-coin/privacy/` 目录，由该仓库的 GitHub Pages 自动发布。公开地址 `https://pacemankun.github.io/danke-coin/privacy/` 已填入开发者后台。维护源文件位于本仓库 `docs/webstore/pages/`，同步更新两个仓库时保持内容一致；插件源码仓库继续保持私有。
3. 商店已上传 128 × 128 图标、440 × 280 小宣传图及一张 1280 × 800 界面截图，源文件位于本目录 `assets/` 和 `public/icons/`。截图由真实扩展的测试界面组成，已标注价格为测试数据。若界面改动，先运行 `npm run test:e2e` 更新截图来源，再运行 `node scripts/generate-store-assets.mjs` 重建商店图片。
4. 已将 `artifacts/danke-coin-0.2.3.zip` 上传到商店草稿。ZIP 根目录直接包含 `manifest.json`，此前已复查包内文件、版本和二维码。这个 ZIP 用于商店后台，不是本地 Chrome「加载未打包」时选择的目录。
5. 已根据[商店文案](store-listing.zh-CN.md)填写详细描述、工具分类、中文（中国）、隐私、单一用途、权限用途和审核测试说明；分发默认选择免费、公开、所有地区。打赏是可选支持，不能描述为付费解锁。首页、支持页面网址和顶部宣传图块暂留空（非必填）。
6. 提交审核。建议选择审核通过后暂缓发布，先检查商店页面及安装体验，再手动公开。通过审核后才可能被搜索到；搜索收录可能还需数小时。

联系邮箱为 `398871200@qq.com`，已在发布者设置中填写，但尚未完成邮件链接验证。Google 账号两步验证状态尚未核实。不要上传个人收款截图原图；扩展 ZIP 中只含已经脱敏的二维码资源。

官方参考：[注册账号](https://developer.chrome.com/docs/webstore/register)、[设置账号](https://developer.chrome.com/docs/webstore/set-up-account)、[准备扩展](https://developer.chrome.com/docs/webstore/prepare)、[发布流程](https://developer.chrome.com/docs/webstore/publish/)、[隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[图片要求](https://developer.chrome.com/docs/webstore/images)、[公开范围](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)。
