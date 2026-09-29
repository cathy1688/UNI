# UNI 监控面板（Cloudflare Worker 版）

深色金融风 UNI 动态监控面板：结论（什么时候买不贵）+ KPI + 协议收入分链图表 + 收益率表。
Worker 每小时整点抓取 DeFiLlama 与 CoinGecko，计算快照写入 KV；前端每次打开读取快照渲染。

## 架构

- `src/index.js` — Cloudflare Worker（ES modules）
  - `scheduled`（Cron `0 * * * *`）：每小时整点抓取并计算快照 → 写入 KV（key = `snapshot`，含 `fetchedAt` UTC ISO 时间）；抓取失败 try/catch，保留旧快照
  - `GET /api/snapshot`：读 KV；KV 为空则先触发一次抓取再返回
  - `POST /api/refresh`：手动刷新（前端"立即刷新"按钮）
  - 其他路径：托管 `public/` 静态前端
- `public/index.html` — 前端（ECharts CDN，深色金融风）
- KV 绑定名：`CACHE`

## 核心口径

- 今日 = 最近一个完整 UTC 日（排除 UTC 当天未完成的数据点）；界面文案用"今日"
- 主收益率 = 30天日均协议收入 × 365 ÷ FDV
- 估值档位：<2% 贵；2–3% 中间偏贵；3–4% 中间；4–6% 便宜；≥6% 很便宜
- 收入方向：7天均值 vs 30天均值，高 5% 以上在涨、低 5% 以上在跌、其余走平
- 结论矩阵：便宜/很便宜+在涨=可以买（不贵）；便宜/很便宜+走平或在跌=便宜但动量弱，等企稳或分批；中间+在涨=合理，等回调；中间+走平或在跌=不动；中间偏贵/贵+在涨=不动，等回调；中间偏贵/贵+走平或在跌=不动（贵）
- 8月基线 = 2026-08-01~08-31 日均协议收入（从数据动态计算）
- Robinhood 收入占比：7天 / 30天双口径

## 部署步骤

1. 安装依赖（需 Node 18+）：
   ```bash
   npm install
   ```
2. 登录 Cloudflare：
   ```bash
   npx wrangler login
   ```
3. 创建 KV namespace：
   ```bash
   npx wrangler kv namespace create CACHE
   ```
   把返回的 `id` 填到 `wrangler.toml` 中，替换 `PLACEHOLDER_KV_ID`。
4. 把 `wrangler.toml` 中的 `account_id` 换成你的 Cloudflare 账号 ID
   （`wrangler login` 后也可直接删掉该行，使用默认账号）。
5. 部署：
   ```bash
   npx wrangler deploy
   ```
6. 部署后 Cron 自动按 `0 * * * *`（每小时整点）生效；页面上的"立即刷新"按钮可手动触发。

## 说明

- 无需任何密钥：DeFiLlama 与 CoinGecko 接口均为公开接口，代码中不含任何 token。
- 首次部署后 KV 为空，第一次打开页面会自动触发一次抓取（约需数秒）。
- CoinGecko 免费接口有频率限制，每小时一次抓取在限额内；若某次抓取失败，面板保留上一次成功快照并可通过"立即刷新"重试。
