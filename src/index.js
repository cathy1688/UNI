/**
 * UNI 监控面板 — Cloudflare Worker
 *
 * - scheduled（Cron 每小时整点）：抓取 DeFiLlama + CoinGecko，计算快照写入 KV（key="snapshot"）
 * - GET  /api/snapshot：读取 KV 快照；KV 为空则先触发一次抓取再返回
 * - POST /api/refresh ：手动刷新快照
 * - 其他路径：托管 public/ 静态前端
 *
 * 抓取失败时 try/catch，保留 KV 中的旧快照，不覆盖。
 */

// 构建时由 scripts/build.mjs 注入 public/index.html 的完整内容
const INDEX_HTML = "__UNI_INDEX_HTML__";

const LLAMA_URL = 'https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue';
const CG_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=uniswap&price_change_percentage=7d,30d';

// DeFiLlama 价格备用源（CoinGecko 常屏蔽数据中心 IP）
const LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/coingecko:uniswap';
const llamaHist = (ts) => `https://coins.llama.fi/prices/historical/${ts}/coingecko:uniswap`;
const UNI_TOTAL_SUPPLY = 1e9; // UNI 总供应 10 亿固定，FDV = 现价 × 1e9

// UTC 时间戳（秒）
const AUG_END = 1788220800; // 2026-09-01T00:00:00Z
const AUG_START = 1785542400; // 2026-08-01T00:00:00Z

// 分链堆叠展示的主力链（按近 30 天协议收入排序），其余并入"其他"
const TOP_CHAINS = [
  'Robinhood Chain',
  'Ethereum',
  'Base',
  'Arbitrum',
  'BSC',
  'Polygon',
  'OP Mainnet',
];

function dayTotal(bd) {
  let s = 0;
  for (const ch of Object.values(bd)) for (const v of Object.values(ch)) s += v;
  return s;
}

function chainTotal(bd, chain) {
  const c = bd[chain];
  if (!c) return 0;
  let s = 0;
  for (const v of Object.values(c)) s += v;
  return s;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmtDate = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// 估值档位：主收益率 = 30天日均协议收入 × 365 ÷ FDV
function tierOf(y) {
  if (y < 0.02) return '贵';
  if (y < 0.03) return '中间偏贵';
  if (y < 0.04) return '中间';
  if (y < 0.06) return '便宜';
  return '很便宜';
}

// 结论矩阵：估值档位 × 收入方向
function verdictOf(tier, dir) {
  const cheap = tier === '便宜' || tier === '很便宜';
  const mid = tier === '中间';
  if (cheap && dir === '在涨') return '可以买（不贵）';
  if (cheap) return '便宜但动量弱，等企稳或分批';
  if (mid && dir === '在涨') return '合理，等回调';
  if (mid) return '不动';
  if (dir === '在涨') return '不动，等回调';
  return '不动（贵）';
}

const EXPLAINS = {
  '可以买（不贵）': '收益率进入便宜区间，且短期收入趋势向上。',
  '便宜但动量弱，等企稳或分批': '估值已便宜，但短期收入动量转弱，等企稳或分批。',
  '合理，等回调': '估值合理，短期收入在涨，等回调。',
  '不动': '估值中等，短期收入动量不足，先不动。',
  '不动，等回调': '估值偏贵但短期收入在涨，等回调。',
  '不动（贵）': '收益率偏低，同时短期协议收入未强于30日趋势。',
};

function buildSnapshot(rev, cg) {
  const rows = rev.totalDataChartBreakdown;
  if (!rows || !rows.length) throw new Error('empty llama payload');

  // D0 = 最近一个完整 UTC 日：必须排除 UTC 当天未完成的数据点
  const nowSec = Math.floor(Date.now() / 1000);
  const utcMidnight = nowSec - (nowSec % 86400);
  const done = rows.filter((r) => r[0] < utcMidnight);
  if (!done.length) throw new Error('no complete day');

  const totals = done.map((r) => dayTotal(r[1]));
  const dates = done.map((r) => fmtDate(r[0]));
  const n = done.length;

  const today = totals[n - 1];
  const avg7 = mean(totals.slice(-7));
  const avg30 = mean(totals.slice(-30));

  // 8月基线 = 2026-08-01~08-31 日均协议收入（动态计算）
  const augRows = done.filter((r) => r[0] >= AUG_START && r[0] < AUG_END);
  const augBaseline = augRows.length ? mean(augRows.map((r) => dayTotal(r[1]))) : 0;

  // 自打开开关以来
  // 自打开开关以来 = 第一个有协议收入的日子起（动态定位，不写死）
  const switchIdx = done.findIndex((r) => dayTotal(r[1]) > 0);
  const ytdRows = switchIdx >= 0 ? done.slice(switchIdx) : [];
  const ytdSum = ytdRows.reduce((s, r) => s + dayTotal(r[1]), 0);
  const ytdAvg = ytdRows.length ? ytdSum / ytdRows.length : 0;
  const ytdSince = ytdRows.length ? fmtDate(ytdRows[0][0]) : null;

  // 收入方向：7天均值 vs 30天均值，±5% 阈值
  const dirPct = avg30 ? (avg7 - avg30) / avg30 : 0;
  const direction = dirPct > 0.05 ? '在涨' : dirPct < -0.05 ? '在跌' : '走平';

  const price = cg || {};
  const fdv = price.fully_diluted_valuation || 0;
  const mcap = price.market_cap || 0;
  const yld = fdv > 0 ? (avg30 * 365) / fdv : 0;
  const tier = tierOf(yld);
  const verdictText = verdictOf(tier, direction);

  // Robinhood 收入占比：7天 / 30天双口径
  const sumTot = (arr) => arr.reduce((s, r) => s + dayTotal(r[1]), 0);
  const sumRh = (arr) => arr.reduce((s, r) => s + chainTotal(r[1], 'Robinhood Chain'), 0);
  const last7 = done.slice(-7);
  const last30 = done.slice(-30);
  const rh7 = sumTot(last7) ? sumRh(last7) / sumTot(last7) : 0;
  const rh30 = sumTot(last30) ? sumRh(last30) / sumTot(last30) : 0;

  // 分链日序列（主力链 + 其他）
  const chains = {};
  for (const ch of TOP_CHAINS) chains[ch] = done.map((r) => chainTotal(r[1], ch));
  chains['其他'] = done.map((r) => {
    let s = dayTotal(r[1]);
    for (const ch of TOP_CHAINS) s -= chainTotal(r[1], ch);
    return Math.max(0, s);
  });

  // 7/30天均线（数据不足处为 null）
  const ma = (k) =>
    totals.map((_, i) => (i + 1 >= k ? mean(totals.slice(i + 1 - k, i + 1)) : null));

  // 四种收入年化 × 流通市值 / FDV 收益率表
  const ann = (v) => v * 365;
  const yieldTable = [
    { name: '今日年化', v: ann(today) },
    { name: '7天日均年化', v: ann(avg7) },
    { name: '30天日均年化', v: ann(avg30) },
    { name: '开关以来日均年化', v: ann(ytdAvg) },
  ].map((r) => ({
    ...r,
    vsMcap: mcap ? r.v / mcap : 0,
    vsFdv: fdv ? r.v / fdv : 0,
  }));

  // 价格与收入背离提示
  const chg7 = price.price_change_percentage_7d_in_currency ?? null;
  let divergence;
  if (direction === '在跌' && chg7 !== null && chg7 > 5) {
    divergence = `价格7天上涨 ${chg7.toFixed(1)}%，但协议收入在跌（7天相对30天 ${(dirPct * 100).toFixed(1)}%），注意背离。`;
  } else if (direction === '在涨' && chg7 !== null && chg7 < -5) {
    divergence = `协议收入在涨（7天相对30天 +${(dirPct * 100).toFixed(1)}%），但价格7天 ${chg7.toFixed(1)}%，数据在涨、价格不动。`;
  } else {
    divergence = '价格与收入方向暂无明显背离。';
  }

  return {
    fetchedAt: new Date().toISOString(),
    d0: fmtDate(done[n - 1][0]), // 文案统一用"今日"，此处仅存日期
    price: {
      usd: price.current_price ?? null,
      mcap,
      fdv,
      chg24h: price.price_change_percentage_24h ?? null,
      chg7d: chg7,
      chg30d: price.price_change_percentage_30d_in_currency ?? null,
    },
    augBaseline,
    kpi: {
      today: { v: today, mult: augBaseline ? today / augBaseline : 0 },
      avg7: { v: avg7, mult: augBaseline ? avg7 / augBaseline : 0 },
      avg30: { v: avg30, mult: augBaseline ? avg30 / augBaseline : 0 },
      ytd: {
        sum: ytdSum,
        days: ytdRows.length,
        avg: ytdAvg,
        since: ytdSince,
        mult: augBaseline ? ytdAvg / augBaseline : 0,
      },
      robinhood: { share7: rh7, share30: rh30 },
    },
    verdict: {
      yieldPct: yld * 100,
      tier,
      direction,
      dirPct: dirPct * 100,
      text: verdictText,
      explain: EXPLAINS[verdictText],
    },
    yieldTable,
    divergence,
    series: { dates, totals, chains, ma7: ma(7), ma30: ma(30) },
  };
}

async function getPriceFromLlama() {
  const now = Math.floor(Date.now() / 1000);
  const urls = [
    LLAMA_PRICE_URL,
    llamaHist(now - 86400),
    llamaHist(now - 7 * 86400),
    llamaHist(now - 30 * 86400),
    'https://api.llama.fi/protocol/uniswap', // 取流通市值 mcap
  ];
  const rs = await Promise.all(urls.map((u) => fetch(u)));
  if (rs.some((r) => !r.ok)) throw new Error('llama price failed');
  const js = await Promise.all(rs.map((r) => r.json()));
  const px = (j) => j.coins['coingecko:uniswap'].price;
  const [p0, p1, p7, p30] = js.slice(0, 4).map(px);
  if (!p0) throw new Error('llama price empty');
  const chg = (p) => (((p0 - p) / p) * 100);
  return {
    current_price: p0,
    fully_diluted_valuation: p0 * UNI_TOTAL_SUPPLY,
    market_cap: js[4].mcap || null,
    price_change_percentage_24h: chg(p1),
    price_change_percentage_7d_in_currency: chg(p7),
    price_change_percentage_30d_in_currency: chg(p30),
  };
}

// 价格：优先 CoinGecko（带完整市值），被屏蔽时降级到 DeFiLlama
async function getPrice() {
  try {
    const r = await fetch(CG_URL, { headers: { 'user-agent': 'uni-dashboard/1.0' } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr[0] && arr[0].current_price) return arr[0];
    }
  } catch {}
  try {
    return await getPriceFromLlama();
  } catch {}
  return null;
}

async function refreshSnapshot(env) {
  try {
    const [rr, price] = await Promise.all([fetch(LLAMA_URL), getPrice()]);
    if (!rr.ok) throw new Error(`upstream ${rr.status}`);
    const rev = await rr.json();
    const snap = buildSnapshot(rev, price);
    await env.CACHE.put('snapshot', JSON.stringify(snap));
    return snap;
  } catch (e) {
    // 抓取失败：保留 KV 中的旧快照，不覆盖
    return await env.CACHE.get('snapshot', 'json');
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  // Cron Trigger：每小时整点刷新快照
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshSnapshot(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/snapshot' && request.method === 'GET') {
      let snap = await env.CACHE.get('snapshot', 'json');
      if (!snap) snap = await refreshSnapshot(env); // KV 为空时先触发一次抓取
      if (!snap) return json({ error: 'snapshot unavailable' }, 503);
      return json(snap);
    }

    if (url.pathname === '/api/debug' && request.method === 'GET') {
      const out = {};
      try {
        const r = await fetch(LLAMA_URL);
        out.revenue = { ok: r.ok, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      } catch (e) { out.revenue = { error: String(e && e.message || e) }; }
      try {
        const r = await fetch(CG_URL, { headers: { 'user-agent': 'uni-dashboard/1.0' } });
        out.coingecko = { ok: r.ok, status: r.status };
      } catch (e) { out.coingecko = { error: String(e && e.message || e) }; }
      try {
        const r = await fetch(LLAMA_PRICE_URL);
        out.llamaPrice = { ok: r.ok, status: r.status };
      } catch (e) { out.llamaPrice = { error: String(e && e.message || e) }; }
      try {
        await env.CACHE.put('__debug', '1', { expirationTtl: 60 });
        out.kv = { writeRead: (await env.CACHE.get('__debug')) === '1' };
      } catch (e) { out.kv = { error: String(e && e.message || e) }; }
      return json(out);
    }

    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const snap = await refreshSnapshot(env);
      if (!snap) return json({ error: 'refresh failed, kept old snapshot' }, 502);
      return json({ ok: true, fetchedAt: snap.fetchedAt });
    }

    // 静态前端（构建时已内联进 INDEX_HTML，不再依赖 ASSETS 绑定）
    return new Response(INDEX_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    });
  },
};
