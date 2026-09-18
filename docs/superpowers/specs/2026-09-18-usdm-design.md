# USDT 永续行情支持

用户希望搜索并将 BTWUSDT 合约加入工具栏关注。保留现货，在搜索面板增加「现货 / USDT 永续」选择；永续目录来自币安交易规则接口，仅纳入 TRADING、PERPETUAL、USDT 计价且以 USDT 结算的合约。显示最新成交价及滚动 24 小时涨跌，不展示标记价格或提供交易操作。

现货与永续可以同时加入同一自选，总上限仍为 20。`MarketSymbol.market` 可选，缺失表示旧版现货；`pairKey` 保持现货键 BTCUSDT，永续键 usdm:BTCUSDT，防止同名市场串价。持久化的旧设置和报价继续可用。每个市场独立 REST、目录缓存、限流状态、WebSocket 和连接健康状态，单个市场失败不抹掉另一个市场的行情。

REST 增加 https://fapi.binance.com，使用 /fapi/v1/exchangeInfo 和 /fapi/v1/ticker/24hr?symbol=...；单币请求权重 1，不使用现货专属 symbols 参数。最多 20 个自选，请求并发不超过 4。WebSocket 使用官方新路由 wss://fstream.binance.com/market/stream?streams=...@ticker，约两秒更新；保留 20 秒合法订阅查询保活、超时、自动重连和缓存。

在搜索结果、详情、自选和角标悬浮说明中标明市场及价格口径。保留源码与市场分离，权限仅新增币安合约数据域名。发布 0.2.0 包，说明 Chrome 重新加载及新增域名权限。

来源：
- https://www.binance.com/zh-CN/support/announcement/detail/61e41ce0e4b74dc7a794cc6bf9c57d38
- https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data
- https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market

网络核验：本次现货 BTWUSDT 返回 -1121；终端访问 fapi 超时。需要单独记录浏览器真实合约访问结果，不能把模拟报价描述为真实联网成功。
