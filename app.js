let PUBLIC_DATA = null;
let DATA = null;

const API_BASE =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? ""
    : "https://api.invest-hsbg.uk";
const AUTH_TOKEN_KEY = "hsbg.authToken";
const REMEMBER_ID_KEY = "hsbg.rememberClientId";
const REPORT_BASE =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "./downloads/"
    : "https://raw.githubusercontent.com/cswangchen/cswangchen.github.io/master/downloads/";

const state = {
  activeId: "",
  market: "全部",
  search: "",
  sort: "value",
  assetRange: "1m",
  tradeFilter: "全部",
  showAllHoldings: false,
  selectedHoldingCode: "",
  autoRefresh: localStorage.getItem("hsbg.autoRefresh") === "1",
};

const MARKET_COLORS = {
  港股: "#0f766e",
  A股: "#c9a227",
  美股: "#2a8d9a",
  现金: "#64748b",
  全市场: "#071a2f",
};

const DIVIDEND_DATES = {
  christmas2024: "2024-12-25",
  mid2025: "2025-06-11",
  specialJan2026: "2026-01-19",
  annual2025: "2026-01-28",
};

const REPORTS = [
  {
    title: "2025 年第一季度投资总结报告",
    period: "2025 Q1",
    kind: "季度报",
    type: "PDF",
    size: "426 KB",
    generatedAt: "2025-04-02",
    file: "hsbg-2025-q1-investment-report.pdf",
  },
  {
    title: "2025 年第三季度路演报告",
    period: "2025 Q3",
    kind: "季度报",
    type: "PPTX",
    size: "1.4 MB",
    generatedAt: "2025-10-01",
    file: "hsbg-2025-q3.pptx",
  },
  {
    title: "2025 年度基金报告",
    period: "Annual 2025",
    kind: "年报",
    type: "PDF",
    size: "1.0 MB",
    generatedAt: "2026-01-27",
    file: "hsbg-2025-annual-report-20260127.pdf",
  },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dash(value) {
  return value === null || value === undefined || value === "" ? "--" : value;
}

async function api(path, options = {}) {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: API_BASE ? "omit" : "same-origin",
    headers,
    signal: controller.signal,
    ...options,
  }).catch((error) => {
    if (error.name === "AbortError") throw new Error("连接服务超时，请稍后重试");
    throw error;
  });
  clearTimeout(timeout);
  try {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function formatCurrency(value, digits = 0) {
  const number = asNumber(value);
  if (number === null) return "--";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function formatSignedCurrency(value, digits = 0) {
  const number = asNumber(value);
  if (number === null) return "--";
  const formatted = formatCurrency(Math.abs(number), digits);
  return number > 0 ? `+${formatted}` : number < 0 ? `-${formatted}` : formatted;
}

function formatNumber(value, digits = 0) {
  const number = asNumber(value);
  if (number === null) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function formatPercent(value, digits = 2) {
  const number = asNumber(value);
  if (number === null) return "--";
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function formatDate(value) {
  if (!value) return "--";
  return String(value).slice(0, 10);
}

function tone(value) {
  const number = Number(value || 0);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "neutral";
}

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function currentContext() {
  return DATA?.context || null;
}

function isAdminSession() {
  return DATA?.session?.role === "admin";
}

function getMarketColor(market) {
  return MARKET_COLORS[market] || MARKET_COLORS["全市场"];
}

function tickerFallback(code = "") {
  const cleaned = String(code || "CASH").replace(/^S[HZ]/, "").replace(/^HK/, "");
  if (cleaned === "CASH") return "CASH";
  return cleaned.length <= 4 ? cleaned : cleaned.slice(0, 4);
}

function logoMarkup(item) {
  const code = item?.code || "CASH";
  const src = `./assets/company-logos/${encodeURIComponent(code)}.png`;
  return `
    <span class="company-logo" aria-hidden="true">
      <img src="${src}" alt="" onerror="this.classList.add('is-missing')" />
      <span>${escapeHtml(tickerFallback(code))}</span>
    </span>
  `;
}

function marketItems(source = DATA || PUBLIC_DATA) {
  return (source?.marketSummary || []).filter((item) => item.market !== "全市场");
}

function setView(loggedIn) {
  $("#loginView")?.classList.toggle("hidden", loggedIn);
  $("#appView")?.classList.toggle("hidden", !loggedIn);
}

function skeleton(container, count = 3) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `<div class="skeleton"></div>`).join("");
}

function renderLoginSnapshot() {
  if (!PUBLIC_DATA) return;
  $("#loginAsOf").textContent = `数据日 ${PUBLIC_DATA.fund?.asOfDate || "--"}`;
  $("#loginNav").textContent = `NAV ${formatNumber(PUBLIC_DATA.fund?.latestNav?.nav, 4)}`;
  $("#loginRefresh").textContent = `Last refreshed ${formatDate(PUBLIC_DATA.fund?.asOfDate)} HKT`;

  const top = PUBLIC_DATA.topPerformers?.length
    ? PUBLIC_DATA.topPerformers
    : [...(PUBLIC_DATA.holdings || [])]
        .filter((item) => item.market !== "现金")
        .sort((a, b) => Number(b.cumulativeReturn || 0) - Number(a.cumulativeReturn || 0))
        .slice(0, 6);

  const performerTarget = $("#loginTopPerformers");
  if (!top.length) {
    performerTarget.innerHTML = `<div class="empty-state">暂无可展示的持仓收益率数据</div>`;
  } else {
    performerTarget.innerHTML = top
      .slice(0, 6)
      .map((item, index) => {
        const rate = Number(item.returnRate ?? item.cumulativeReturn ?? item.floatingReturn ?? 0);
        return `
          <article class="performer-card">
            <div class="logo-row">
              <span class="rank-badge">#${String(index + 1).padStart(2, "0")}</span>
              <span>${escapeHtml(item.code)} · ${escapeHtml(item.market)}</span>
            </div>
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <b class="${tone(rate)}">${formatPercent(rate, 2)}</b>
              <small>最新价 ${formatNumber(item.price, 2)} ${escapeHtml(item.currency || "")}</small>
            </div>
            <a href="${escapeHtml(item.detailUrl || "#")}" target="_blank" rel="noopener noreferrer">查看详情 →</a>
          </article>
        `;
      })
      .join("");
  }

  $("#loginMarketBars").innerHTML = marketItems(PUBLIC_DATA)
    .map((item) => {
      const width = Math.max(2, Number(item.weight || 0) * 100);
      return `
        <div class="market-bar-row">
          <span>${escapeHtml(item.market)}</span>
          <div class="market-bar-track">
            <div class="market-bar-fill" style="width:${width}%;background:${getMarketColor(item.market)}"></div>
          </div>
          <span>${formatPercent(item.weight, 1)}</span>
        </div>
      `;
    })
    .join("");
}

async function login(username, password) {
  $("#loginError").textContent = "";
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if ($("#rememberClientId")?.checked) {
      localStorage.setItem(REMEMBER_ID_KEY, username);
    } else {
      localStorage.removeItem(REMEMBER_ID_KEY);
    }
    if (result.token) sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
    state.activeId = result.user.id;
    await loadPortfolio(result.user.id);
  } catch (error) {
    const message = String(error.message || "");
    $("#loginError").textContent =
      message === "Failed to fetch" || message.includes("超时")
        ? "无法连接云端服务，请稍后重试。"
        : message;
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  DATA = null;
  state.activeId = "";
  setView(false);
  $("#passwordInput").value = "";
  $("#clientIdInput").focus();
}

async function loadPortfolio(clientId = "") {
  const requested = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  DATA = await api(`/api/portfolio${requested}`);
  state.activeId = DATA.context.id;
  state.selectedHoldingCode ||= "";
  setView(true);
  renderApp();
}

function kpi(label, value, detail, valueClass = "", extraClass = "") {
  return `
    <article class="kpi-card ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <strong class="kpi-value ${valueClass}">${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail || "")}</small>
    </article>
  `;
}

function renderVip(context) {
  const isAdmin = context.id === "ADMIN";
  const isVip = Boolean(context.tier?.isVip);
  $("#tierBadge").classList.toggle("hidden", !context.tier);
  $("#tierBadge").textContent = isAdmin ? "ADMIN" : context.tier?.label || "";
  $("#tierBadge").classList.toggle("vip", isVip);
  $("#sideViewLabel").textContent = isAdmin ? "管理员视图" : "客户视图";
  $("#identityTier").textContent = isAdmin ? "ADMIN" : context.tier?.label || "Client Account";
  $("#identityCode").textContent = context.id;
  $("#identityMeta").textContent = isAdmin
    ? `${DATA.clients.length} 位客户 · ${formatCurrency(DATA.fund.clientTotalValue)}`
    : `份额占比 ${formatPercent(context.portfolioRatio, 2)}`;
}

function renderClientSelect() {
  const context = currentContext();
  if (!context) return;
  const items = isAdminSession()
    ? [{ id: "ADMIN", name: "管理员视图" }, ...DATA.clients.map((client) => ({ id: client.id, name: client.name }))]
    : [{ id: context.id, name: context.name }];

  $("#clientSelect").innerHTML = items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}"${item.id === context.id ? " selected" : ""}>${escapeHtml(
          item.id,
        )} · ${escapeHtml(item.name)}</option>`,
    )
    .join("");
  $("#clientSelect").disabled = !isAdminSession();
}

function renderWealthHero(context) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好";
  const isAdmin = context.id === "ADMIN";
  $("#welcomeLine").textContent = isAdmin ? "管理员视图" : `${greeting}，${context.name}`;
  $("#heroMeta").textContent = isAdmin
    ? `数据日 ${DATA.fund.asOfDate} · 全部客户概览`
    : `当前账户 ${context.id} · 数据日 ${DATA.fund.asOfDate} · ${context.tier?.label || "Member"}`;
  $("#asOfLabel").textContent = `数据日 ${DATA.fund.asOfDate} · ${DATA.fund.sourceFile}`;
  $("#clientTitle").textContent = isAdmin ? "HSBG Fund 管理员控制台" : `${context.name} · ${context.id}`;
}

function renderKpis(context) {
  const dividends = context.dividends || { total: 0, cumulativeWithDividends: context.floatingPnl };
  const isAdmin = context.id === "ADMIN";
  if (isAdmin) {
    const recentSubscription = (DATA.cashTransfers || [])
      .filter((item) => item.action === "转入")
      .slice(0, 6)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $("#summarySection").innerHTML = [
      kpi("总 AUM", formatCurrency(DATA.fund.clientTotalValue), "全部客户当前市值", "", "primary"),
      kpi("客户数", formatNumber(DATA.clients.length), "授权账户", "", "important"),
      kpi("今日损益", formatSignedCurrency(DATA.fund.dayPnlCny), `数据日 ${DATA.fund.asOfDate}`, tone(DATA.fund.dayPnlCny)),
      kpi("累计收益", formatCurrency(context.floatingPnl), formatPercent(context.returnRate), tone(context.floatingPnl)),
      kpi("现金余额", formatCurrency(DATA.fund.cashCny), "基金现金展示口径"),
      kpi("近期申购金额", formatCurrency(recentSubscription), "最近资金流入合计"),
    ].join("");
    return;
  }

  $("#summarySection").innerHTML = [
    kpi("当前资产", formatCurrency(context.currentValue), `持仓 ${formatCurrency(context.positionValue)} / 现金 ${formatCurrency(context.cashValue)}`, "", "primary"),
    kpi("当日收益", formatSignedCurrency(context.dayPnl), `数据日 ${DATA.fund.asOfDate}`, tone(context.dayPnl)),
    kpi("累计收益", formatCurrency(context.floatingPnl), formatPercent(context.returnRate), tone(context.floatingPnl)),
    kpi("累计分红", formatCurrency(dividends.total), "已分配现金收益", tone(dividends.total), "dividend-card"),
    kpi("投入本金", formatCurrency(context.totalInvested), `平均买入净值 ${formatNumber(context.totalInvested / context.totalShares, 4)}`, "", "important"),
    kpi("确认份额", formatNumber(context.totalShares, 2), `份额占比 ${formatPercent(context.portfolioRatio, 2)}`),
  ].join("");
}

function renderAssetOverview(context) {
  const dividends = context.dividends || { cumulativeWithDividends: context.floatingPnl };
  const rows = [
    { label: "人民币总资产（元）", marker: "=", value: context.currentValue, income: dividends.cumulativeWithDividends, day: context.dayPnl, total: true },
    { label: "现金账户资产", marker: "■", value: context.cashValue, income: 0, day: 0 },
    { label: "基金资产", marker: "■", value: context.positionValue, income: dividends.cumulativeWithDividends, day: context.dayPnl },
    { label: "投入本金", marker: "+", value: context.totalInvested, income: context.floatingPnl, day: context.dayPnl },
  ];
  $("#assetRows").innerHTML = rows
    .map(
      (row) => `
        <div class="asset-row ${row.total ? "total" : ""}">
          <span class="asset-marker">${escapeHtml(row.marker)}</span>
          <strong>${escapeHtml(row.label)}</strong>
          <b>${formatNumber(row.value, 2)}</b>
          <b class="${tone(row.income)}">${formatNumber(row.income, 2)}</b>
          <b class="${tone(row.day)}">${formatNumber(row.day, 2)}</b>
        </div>
      `,
    )
    .join("");

  const tenK = perTenThousandSeries();
  const currentYear = String(DATA.fund.asOfDate || "").slice(0, 4);
  const yearSum = tenK
    .filter((item) => item.date.startsWith(currentYear))
    .reduce((sum, item) => sum + Number(item.perTenK || 0), 0);
  $("#tenkTotal").textContent = `今年以来 ${formatNumber(yearSum, 2)}`;
  $("#tenkTotal").className = `pill ${tone(yearSum)}`;
  $("#tenkChart").innerHTML = singleLineChart(tenK.slice(-30), "perTenK", { label: "每万份收益" });
}

function dateToTime(date) {
  return new Date(`${date}T00:00:00`).getTime();
}

function dividendsThrough(context, date) {
  const detail = context.dividends?.detail || {};
  return Object.entries(DIVIDEND_DATES).reduce((sum, [key, eventDate]) => {
    return date >= eventDate ? sum + Number(detail[key] || 0) : sum;
  }, 0);
}

function clientAssetSeries(context) {
  const lots = context.lots || [];
  return (DATA?.navHistory || [])
    .filter((row) => row.date && Number(row.nav) > 0)
    .map((row) => {
      const activeLots = lots.filter((lot) => lot.date <= row.date);
      const shares = activeLots.reduce((sum, lot) => sum + Number(lot.shares || 0), 0);
      if (!shares) return null;
      const invested = activeLots.reduce((sum, lot) => sum + Number(lot.investment || 0), 0);
      const asset = shares * Number(row.nav || 0);
      return {
        date: row.date,
        nav: Number(row.nav || 0),
        asset,
        income: asset - invested + dividendsThrough(context, row.date),
      };
    })
    .filter(Boolean);
}

function perTenThousandSeries() {
  const rows = (DATA?.navHistory || PUBLIC_DATA?.navHistory || []).filter((row) => row.date && Number(row.nav) > 0);
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const perTenK = previous ? (Number(row.nav || 0) - Number(previous.nav || 0)) * 10000 : 0;
    return { date: row.date, nav: Number(row.nav || 0), perTenK };
  });
}

function filterSeriesByRange(series, range) {
  if (series.length <= 2) return series;
  const latest = series.at(-1);
  const latestTime = dateToTime(latest.date);
  const cutoff = new Date(latestTime);
  if (range === "1m") cutoff.setMonth(cutoff.getMonth() - 1);
  if (range === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
  if (range === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  if (range === "ytd") cutoff.setMonth(0, 1);
  const filtered = series.filter((item) => dateToTime(item.date) >= cutoff.getTime());
  return filtered.length >= 2 ? filtered : series.slice(-2);
}

function linePath(points, key, x, y) {
  return points.map((item, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(Number(item[key] || 0))}`).join(" ");
}

function dualLineChart(points, primary, secondary, options = {}) {
  if (!points.length) return `<div class="empty-state">暂无趋势数据</div>`;
  const width = options.width || 760;
  const height = options.height || 260;
  const padX = 44;
  const padTop = 24;
  const padBottom = 42;
  const values = points.flatMap((item) => [Number(item[primary.key] || 0), Number(item[secondary.key] || 0)]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index) => padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
  const y = (value) => padTop + (1 - (value - min) / span) * (height - padTop - padBottom);
  const grid = [0, 0.5, 1]
    .map((ratio) => {
      const gridY = padTop + ratio * (height - padTop - padBottom);
      const value = max - ratio * span;
      return `<line x1="${padX}" y1="${gridY}" x2="${width - padX}" y2="${gridY}" stroke="rgba(100,116,139,.16)"/><text x="${padX - 8}" y="${gridY + 4}" text-anchor="end" fill="#64748B" font-size="11">${formatNumber(value, options.digits ?? 0)}</text>`;
    })
    .join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label || "资产走势")}">
      ${grid}
      <path class="income-line primary-line" d="${linePath(points, primary.key, x, y)}"></path>
      <path class="income-line secondary-line" d="${linePath(points, secondary.key, x, y)}"></path>
      <circle class="chart-dot" cx="${x(points.length - 1)}" cy="${y(points.at(-1)[primary.key])}" r="5"></circle>
      <text x="${padX}" y="${height - 10}" fill="#64748B" font-size="12">${escapeHtml(points[0].date)}</text>
      <text x="${width - padX}" y="${height - 10}" text-anchor="end" fill="#64748B" font-size="12">${escapeHtml(points.at(-1).date)}</text>
    </svg>
    <div class="chart-legend">
      <span class="chart-legend-item primary-line">${escapeHtml(primary.label)}</span>
      <span class="chart-legend-item secondary-line">${escapeHtml(secondary.label)}</span>
    </div>
  `;
}

function singleLineChart(points, key, options = {}) {
  const normalized = points.map((item) => ({ ...item, zero: 0 }));
  return dualLineChart(
    normalized,
    { key, label: options.label || "每万份收益" },
    { key: "zero", label: "0" },
    { width: 460, height: 220, digits: 2, label: options.label || "每万份收益" },
  );
}

function renderAssetIncome(context) {
  const points = filterSeriesByRange(clientAssetSeries(context), state.assetRange);
  $("#assetIncomeChart").innerHTML = dualLineChart(
    points.map((item) => ({ ...item, assetWan: item.asset / 10000 })),
    { key: "assetWan", label: "总资产（万元）" },
    { key: "income", label: "总收益（元）" },
    { label: "资产与收益走势", digits: 2 },
  );
  renderMarketPie(context);
}

function renderMarketPie(context) {
  const rows = [
    ...marketItems(DATA).map((item) => ({
      label: item.market,
      value: item.marketValueCny * context.portfolioRatio,
      color: getMarketColor(item.market),
    })),
    { label: "现金", value: context.cashValue, color: getMarketColor("现金") },
  ].filter((item) => Number(item.value) > 0);
  const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
  let start = 0;
  const gradient = rows
    .map((item) => {
      const end = start + (item.value / total) * 100;
      const segment = `${item.color} ${start}% ${end}%`;
      start = end;
      return segment;
    })
    .join(", ");
  $("#marketPie").innerHTML = `
    <div class="donut-wrap">
      <div class="pie-disc" style="background: conic-gradient(${gradient})"></div>
      <div class="donut-center">
        <span>总资产</span>
        <strong>${formatCurrency(context.currentValue)}</strong>
      </div>
    </div>
    <div class="pie-legend">
      ${rows
        .map(
          (item) => `
            <span><i style="background:${item.color}"></i>${escapeHtml(item.label)} <b>${formatCurrency(item.value)}</b> ${formatPercent(
              item.value / total,
              1,
            )}</span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderNavChart() {
  const points = (DATA?.performanceBenchmark || PUBLIC_DATA?.performanceBenchmark || []).filter(
    (item) => item.fundTotalReturnIndex > 0 && item.weightedBenchmarkIndex > 0,
  );
  if (!points.length) {
    $("#navChart").innerHTML = `<div class="empty-state">暂无净值对标数据</div>`;
    return;
  }
  const width = 640;
  const height = 260;
  const padX = 36;
  const padTop = 24;
  const padBottom = 54;
  const series = [
    { key: "fundTotalReturnIndex", label: "基金含分红", className: "benchmark-fund" },
    { key: "weightedBenchmarkIndex", label: "权重基准", className: "benchmark-index" },
    { key: "fundPriceIndex", label: "基金净值", className: "benchmark-price" },
  ];
  const values = points.flatMap((item) => series.map((serie) => Number(item[serie.key] || 0))).filter(Boolean);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index) => padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
  const y = (value) => padTop + (1 - (value - min) / span) * (height - padTop - padBottom);
  const pathFor = (key) =>
    points.map((item, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(Number(item[key] || 0))}`).join(" ");
  const latest = points.at(-1);
  const grid = [0, 0.5, 1]
    .map((ratio) => {
      const gridY = padTop + ratio * (height - padTop - padBottom);
      const value = max - ratio * span;
      return `<line x1="${padX}" y1="${gridY}" x2="${width - padX}" y2="${gridY}" stroke="rgba(100,116,139,.16)"/><text x="${padX}" y="${gridY - 5}" fill="#64748B" font-size="11">${formatNumber(value, 1)}</text>`;
    })
    .join("");
  const pointNodes = points
    .map(
      (item, index) => `<circle class="nav-point" cx="${x(index)}" cy="${y(item.fundTotalReturnIndex)}" r="4" data-date="${escapeHtml(
        item.date,
      )}" data-fund="${item.fundTotalReturnIndex}" data-price="${item.fundPriceIndex}" data-benchmark="${
        item.weightedBenchmarkIndex
      }" data-excess="${item.excessReturn || 0}"></circle>`,
    )
    .join("");
  const lines = series
    .map((serie) => `<path d="${pathFor(serie.key)}" class="benchmark-line ${serie.className}"></path>`)
    .join("");
  const legend = series
    .map((serie) => `<span class="chart-legend-item ${serie.className}">${escapeHtml(serie.label)}</span>`)
    .join("");

  $("#navChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="净值对标曲线">
      ${grid}
      ${lines}
      ${pointNodes}
      <text x="${padX}" y="${height - 12}" fill="#64748B" font-size="12">${escapeHtml(points[0].date)}</text>
      <text x="${width - padX}" y="${height - 12}" text-anchor="end" fill="#64748B" font-size="12">${escapeHtml(latest.date)}</text>
      <text x="${x(points.length - 1) - 8}" y="${y(latest.fundTotalReturnIndex) - 12}" text-anchor="end" fill="#111827" font-size="13" font-weight="800">${formatNumber(
        latest.fundTotalReturnIndex,
        1,
      )}</text>
    </svg>
    <div class="chart-legend">${legend}</div>
    <div class="nav-tooltip hidden" id="navTooltip"></div>
  `;

  const tooltip = $("#navTooltip");
  $$(".nav-point", $("#navChart")).forEach((point) => {
    point.addEventListener("mouseenter", () => {
      tooltip.classList.remove("hidden");
      tooltip.innerHTML = `
        <strong>${escapeHtml(point.dataset.date)}</strong>
        <span>基金含分红 ${formatNumber(point.dataset.fund, 2)}</span>
        <small>权重基准 ${formatNumber(point.dataset.benchmark, 2)}</small>
        <small>基金净值 ${formatNumber(point.dataset.price, 2)}</small>
        <small>超额 ${formatPercent(point.dataset.excess, 2)}</small>
      `;
    });
    point.addEventListener("mousemove", (event) => {
      const rect = $("#navChart").getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left + 12}px`;
      tooltip.style.top = `${event.clientY - rect.top - 16}px`;
    });
    point.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
  });
}

function renderMarketSummary(context) {
  $("#fundDayPnl").textContent = `今日 ${formatSignedCurrency(context.dayPnl)}`;
  $("#fundDayPnl").className = `pill ${tone(context.dayPnl)}`;
  $("#marketSummary").innerHTML = marketItems(DATA)
    .map((item) => {
      const marketValue = item.marketValueCny * context.portfolioRatio;
      const dayPnl = item.dayPnlCny * context.dailyPnlRatio;
      const weight = context.currentValue ? marketValue / context.currentValue : 0;
      const active = state.market === item.market ? " active" : "";
      return `
        <button class="market-card${active}" type="button" data-market-summary="${escapeHtml(item.market)}">
          <div>
            <strong>${escapeHtml(item.market)}</strong>
            <small>${escapeHtml(item.note || "")}</small>
          </div>
          <div class="allocation-track" aria-label="${escapeHtml(item.market)} ${formatPercent(weight)}">
            <div class="allocation-fill" style="width:${Math.max(1, weight * 100)}%;background:${getMarketColor(item.market)}"></div>
          </div>
          <div class="market-values">
            <b>${formatCurrency(marketValue)}</b>
            <small class="${tone(dayPnl)}">今日 ${formatSignedCurrency(dayPnl)} · ${formatPercent(weight, 1)}</small>
          </div>
        </button>
      `;
    })
    .join("");
  $$("[data-market-summary]").forEach((button) => {
    button.addEventListener("click", () => {
      state.market = state.market === button.dataset.marketSummary ? "全部" : button.dataset.marketSummary;
      state.showAllHoldings = false;
      renderMarketFilters();
      renderHoldings(currentContext());
      renderTopHoldingsStrip(currentContext());
      renderHoldingDetails(currentContext());
      renderMarketSummary(currentContext());
      $("#holdingsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderClientList(context) {
  const isAdmin = isAdminSession() && context.id === "ADMIN";
  $("#clientListTitle").textContent = isAdmin ? "客户列表" : "账户身份";
  const clients = isAdmin ? DATA.clients : [context];
  $("#clientList").innerHTML = clients
    .map((client) => {
      const vip = client.tier?.isVip ? `<span class="mini-vip">VIP</span>` : "";
      const action = isAdmin
        ? `<button type="button" data-client-jump="${escapeHtml(client.id)}">查看</button>`
        : `<span class="code-pill">当前</span>`;
      return `
        <div class="client-row">
          <div>
            <strong>${escapeHtml(client.name)} ${vip}</strong>
            <small>${escapeHtml(client.id)} · ${formatCurrency(client.currentValue)} · ${formatPercent(client.portfolioRatio, 2)}</small>
          </div>
          ${action}
        </div>
      `;
    })
    .join("");

  $$("[data-client-jump]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadPortfolio(button.dataset.clientJump);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderMarketFilters() {
  const markets = ["全部", "港股", "A股", "美股", "现金"];
  $("#marketFilters").innerHTML = markets
    .map(
      (market) =>
        `<button type="button" class="${state.market === market ? "active" : ""}" data-market="${escapeHtml(market)}">${escapeHtml(
          market,
        )}</button>`,
    )
    .join("");
  $$("[data-market]", $("#marketFilters")).forEach((button) => {
    button.addEventListener("click", () => {
      state.market = button.dataset.market;
      state.showAllHoldings = false;
      renderMarketFilters();
      renderHoldings(currentContext());
      renderTopHoldingsStrip(currentContext());
      renderHoldingDetails(currentContext());
      renderMarketSummary(currentContext());
    });
  });
}

function holdingRows(context, includeCash = true) {
  const rows = DATA.holdings.map((item) => {
    const value = item.marketValueCny * context.portfolioRatio;
    return {
      ...item,
      value,
      userWeight: context.currentValue ? value / context.currentValue : 0,
      userDayPnl: item.dayPnlCny * context.dailyPnlRatio,
      userFloatingPnl: item.floatingPnl * context.portfolioRatio,
      userCumulativePnl: item.cumulativePnl * context.portfolioRatio,
      userQuantity: item.quantity * context.portfolioRatio,
      isCash: false,
    };
  });

  if (includeCash) {
    rows.push({
      name: "现金",
      code: "CASH",
      market: "现金",
      currency: "CNY",
      price: 1,
      change: { raw: "0.00(0.00%)", amount: 0, rate: 0 },
      value: context.cashValue,
      userWeight: context.currentValue ? context.cashValue / context.currentValue : 0,
      userDayPnl: 0,
      userFloatingPnl: 0,
      userCumulativePnl: 0,
      userQuantity: context.cashValue,
      isCash: true,
    });
  }

  const term = state.search.trim().toLowerCase();
  return rows
    .filter((item) => state.market === "全部" || item.market === state.market)
    .filter((item) => {
      if (!term) return true;
      return [item.name, item.code, item.market].some((value) => String(value).toLowerCase().includes(term));
    })
    .sort((a, b) => {
      if (state.sort === "dayPnl") return b.userDayPnl - a.userDayPnl;
      if (state.sort === "floatingPnl") return b.userCumulativePnl - a.userCumulativePnl;
      if (state.sort === "weight") return b.userWeight - a.userWeight;
      return b.value - a.value;
    });
}

function stockNameCell(item) {
  if (item.isCash || !item.detailUrl) return escapeHtml(item.name);
  return `<a class="stock-link" href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
    item.name,
  )}</a>`;
}

function selectHolding(code, scroll = false) {
  state.selectedHoldingCode = code;
  renderTopHoldingsStrip(currentContext());
  renderHoldings(currentContext());
  renderHoldingDetails(currentContext());
  if (scroll) {
    const row = document.querySelector(`[data-holding-row="${CSS.escape(code)}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function renderTopHoldingsStrip(context) {
  const rows = holdingRows(context, false).sort((a, b) => b.value - a.value).slice(0, 10);
  $("#topHoldingsStrip").innerHTML = rows
    .map(
      (item, index) => `
        <article class="holding-logo-card ${state.selectedHoldingCode === item.code ? "active" : ""}" data-top-holding="${escapeHtml(item.code)}">
          <div class="logo-row">
            ${logoMarkup(item)}
            <span class="rank-badge">#${String(index + 1).padStart(2, "0")}</span>
          </div>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.code)} · ${escapeHtml(item.market)}</small>
          </div>
          <div>
            <small>用户市值</small>
            <b>${formatCurrency(item.value)}</b>
          </div>
          <small>${formatPercent(item.userWeight, 2)} · <span class="${tone(item.userCumulativePnl)}">${formatCurrency(item.userCumulativePnl)}</span></small>
          <div class="logo-hover-meta">
            <span>最新价 ${formatNumber(item.price, 2)} ${escapeHtml(item.currency)}</span>
            <span>今日 ${escapeHtml(item.change?.raw || "--")}</span>
            <span class="${tone(item.userDayPnl)}">当日损益 ${formatSignedCurrency(item.userDayPnl)}</span>
          </div>
        </article>
      `,
    )
    .join("");
  $$("[data-top-holding]").forEach((card) => {
    card.addEventListener("click", () => selectHolding(card.dataset.topHolding, true));
  });
}

function renderHoldings(context) {
  const rows = holdingRows(context);
  const shown = state.showAllHoldings ? rows : rows.slice(0, 20);
  $("#holdingLimitButton").textContent = state.showAllHoldings ? "收起为 Top 20" : `查看全部持仓（${rows.length}）`;
  if (!rows.length) {
    $("#holdingsBody").innerHTML = `<tr><td colspan="9" class="name-cell">无匹配持仓</td></tr>`;
    return;
  }
  $("#holdingsBody").innerHTML = shown
    .map((item) => {
      const marketColor = getMarketColor(item.market);
      const priceText = item.isCash ? "--" : `${formatNumber(item.price, 2)} ${item.currency}`;
      const changeText = item.isCash ? "--" : item.change?.raw || "--";
      const active = state.selectedHoldingCode === item.code ? " active-row" : "";
      return `
        <tr class="${active}" data-holding-row="${escapeHtml(item.code)}">
          <td class="name-cell">${stockNameCell(item)}</td>
          <td><span class="market-tag" style="background:${marketColor}">${escapeHtml(item.market)}</span></td>
          <td><span class="code-pill">${escapeHtml(item.code)}</span></td>
          <td>${escapeHtml(priceText)}</td>
          <td class="${tone(item.change?.amount)}">${escapeHtml(changeText)}</td>
          <td>${formatCurrency(item.value)}</td>
          <td>${formatPercent(item.userWeight, 2)}</td>
          <td class="${tone(item.userDayPnl)}">${formatSignedCurrency(item.userDayPnl)}</td>
          <td class="${tone(item.userCumulativePnl)}">${formatCurrency(item.userCumulativePnl)}</td>
        </tr>
      `;
    })
    .join("");
}

function holdingSparkline(item) {
  if (item.isCash) return "";
  const current = Number(item.price || 0);
  const change = Number(item.change?.amount || 0);
  const previous = current - change;
  const values = [previous, previous + change * 0.16, previous + change * 0.34, previous + change * 0.52, previous + change * 0.76, current];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 240;
  const height = 76;
  const x = (index) => 10 + (index / Math.max(values.length - 1, 1)) * (width - 20);
  const y = (value) => 10 + (1 - (value - min) / span) * (height - 20);
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(item.name)} 价格趋势">
      <line x1="10" y1="${height / 2}" x2="${width - 10}" y2="${height / 2}" stroke="rgba(100,116,139,.18)"></line>
      <path d="${path}" class="spark-path ${change >= 0 ? "spark-up" : "spark-down"}"></path>
    </svg>
  `;
}

function renderHoldingDetails(context) {
  const rows = holdingRows(context, false).sort((a, b) => b.value - a.value).slice(0, 10);
  $("#holdingDetailList").innerHTML = rows
    .map((item) => {
      const expanded = state.selectedHoldingCode === item.code;
      return `
        <article class="holding-detail-card">
          <div class="holding-title-row">
            ${logoMarkup(item)}
            <div>
              ${stockNameCell(item)}
              <div><span class="code-pill">${escapeHtml(item.code)}</span> <span class="market-tag" style="background:${getMarketColor(
                item.market,
              )}">${escapeHtml(item.market)}</span></div>
            </div>
          </div>
          <div class="holding-detail-grid">
            <span>最新市值 <b>${formatCurrency(item.value)}</b></span>
            <span>持有数量 <b>${formatNumber(item.userQuantity, 2)}</b></span>
            <span>资产占比 <b>${formatPercent(item.userWeight, 2)}</b></span>
            <span>最新价 <b>${formatNumber(item.price, 2)} ${escapeHtml(item.currency)}</b></span>
            <span>今日涨跌 <b class="${tone(item.change?.amount)}">${escapeHtml(item.change?.raw || "--")}</b></span>
            <span>累计盈亏 <b class="${tone(item.userCumulativePnl)}">${formatCurrency(item.userCumulativePnl)}</b></span>
          </div>
          <div class="holding-spark">${holdingSparkline(item)}</div>
          <button class="detail-button" type="button" data-detail-code="${escapeHtml(item.code)}">${expanded ? "收起" : "详情"}</button>
          ${
            expanded
              ? `<div class="holding-expanded">
                  <div class="expanded-detail-grid">
                    <span>持仓金额 <b>${formatCurrency(item.value)}</b></span>
                    <span>持有数量 <b>${formatNumber(item.userQuantity, 2)}</b></span>
                    <span>平均成本 <b>${escapeHtml(item.cost || "--")}</b></span>
                    <span>当前价格 <b>${formatNumber(item.price, 2)} ${escapeHtml(item.currency)}</b></span>
                    <span>当日损益 <b class="${tone(item.userDayPnl)}">${formatSignedCurrency(item.userDayPnl)}</b></span>
                    <span>资产占比 <b>${formatPercent(item.userWeight, 2)}</b></span>
                  </div>
                </div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
  $$("[data-detail-code]").forEach((button) => {
    button.addEventListener("click", () => selectHolding(state.selectedHoldingCode === button.dataset.detailCode ? "" : button.dataset.detailCode));
  });
}

function renderDividends(context) {
  const dividends = context.dividends || { detail: {}, labels: {}, total: 0, cumulativeWithDividends: 0 };
  const currentYear = String(DATA.fund.asOfDate || "").slice(0, 4);
  const yearDividend = Object.entries(dividends.detail || {}).reduce((sum, [key, value]) => {
    return (DIVIDEND_DATES[key] || "").startsWith(currentYear) ? sum + Number(value || 0) : sum;
  }, 0);
  $("#dividendTotal").textContent = `已分配 ${formatCurrency(dividends.total)}`;
  $("#dividendTotal").className = `pill ${tone(dividends.total)}`;
  const rows = Object.entries(dividends.detail || {}).filter(([, value]) => Number(value || 0) !== 0);
  $("#dividendSummary").innerHTML = `
    <div class="dividend-summary-cards">
      <div class="dividend-summary-card"><span>已分配现金收益</span><strong>${formatCurrency(dividends.total)}</strong></div>
      <div class="dividend-summary-card"><span>今年以来分红</span><strong>${formatCurrency(yearDividend)}</strong></div>
      <div class="dividend-summary-card"><span>合分红累计收益</span><strong class="${tone(dividends.cumulativeWithDividends)}">${formatCurrency(
        dividends.cumulativeWithDividends,
      )}</strong></div>
    </div>
    <div class="dividend-timeline">
      ${
        rows.length
          ? rows
              .map(([key, value]) => {
                const label = dividends.labels?.[key] || key;
                const date = DIVIDEND_DATES[key] || "--";
                return `
                  <div class="timeline-row">
                    <div>
                      <strong>${escapeHtml(label)}</strong>
                      <p>确认日期 ${formatDate(date)} · 到账账户：基金现金账户</p>
                    </div>
                    <div>
                      <strong>${formatCurrency(value)}</strong>
                      <span class="status-badge success">已到账</span>
                    </div>
                  </div>
                `;
              })
              .join("")
          : `<div class="empty-state">暂无分红记录</div>`
      }
    </div>
  `;
}

function renderLots(context) {
  const rows = context.lots || [];
  const avgNav = context.totalShares ? context.totalInvested / context.totalShares : 0;
  $("#lotsSummary").innerHTML = [
    ["累计投入本金", formatCurrency(context.totalInvested)],
    ["确认份额", formatNumber(context.totalShares, 2)],
    ["当前份额价值", formatCurrency(context.currentValue)],
    ["平均买入净值", formatNumber(avgNav, 4)],
  ]
    .map(([label, value]) => `<div class="mini-summary-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  $("#lotsBody").innerHTML = rows
    .slice(0, context.id === "ADMIN" ? 40 : rows.length)
    .map((lot) => {
      const note = context.id === "ADMIN" ? `${lot.clientId} · ${lot.note}` : lot.note;
      return `
        <tr>
          <td>${escapeHtml(lot.date)}</td>
          <td>${formatCurrency(lot.investment)}</td>
          <td>${formatNumber(lot.buyNav, 4)}</td>
          <td>${formatNumber(lot.shares, 2)}</td>
          <td>${formatCurrency(lot.currentValue)}</td>
          <td class="${tone(lot.floatingPnl)}">${formatCurrency(lot.floatingPnl)}</td>
          <td class="name-cell" title="${escapeHtml(note)}">${escapeHtml(note)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAnonymousSubscriptions() {
  const rows = DATA?.anonymousSubscriptions || [];
  const target = $("#anonymousSubscriptionsFeed");
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">暂无可展示的匿名资金流入记录</div>`;
    return;
  }
  target.innerHTML = rows
    .slice(0, 8)
    .map((lot) => {
      const source = lot.isAsOfDateSubscription ? "VIP 客户组" : "匿名客户";
      return `
        <div class="activity-row">
          <div>
            <strong>${formatDate(lot.date)} · 匿名资金流入</strong>
            <p>${source} · 买入净值 ${formatNumber(lot.buyNav, 4)} · 确认份额 ${formatNumber(lot.shares, 2)}</p>
          </div>
          <strong>${formatCurrency(lot.investment)}</strong>
        </div>
      `;
    })
    .join("");
}

function tradeMarket(trade) {
  if (String(trade.code || "").startsWith("SZ") || String(trade.code || "").startsWith("SH")) return "A股";
  if (/^\d+$/.test(String(trade.code || ""))) return "港股";
  return "美股";
}

function renderTradeFilters() {
  const filters = ["全部", "买入", "卖出", "港股", "A股", "美股"];
  $("#tradeFilters").innerHTML = filters
    .map((filter) => `<button type="button" class="${state.tradeFilter === filter ? "active" : ""}" data-trade-filter="${filter}">${filter}</button>`)
    .join("");
  $$("[data-trade-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tradeFilter = button.dataset.tradeFilter;
      renderTradeFilters();
      renderTrades();
    });
  });
}

function renderTrades() {
  const rows = (DATA.recentTrades || []).filter((trade) => {
    if (state.tradeFilter === "全部") return true;
    if (state.tradeFilter === "买入" || state.tradeFilter === "卖出") return trade.type === state.tradeFilter;
    return tradeMarket(trade) === state.tradeFilter;
  });
  $("#tradesBody").innerHTML = rows
    .slice(0, 10)
    .map((trade) => {
      const isBuy = trade.type === "买入";
      const isSell = trade.type === "卖出";
      const badgeClass = isBuy ? "buy" : isSell ? "sell" : "";
      return `
        <tr>
          <td>${escapeHtml(trade.date)}</td>
          <td class="name-cell">
            <details>
              <summary><a class="stock-link" href="${escapeHtml(trade.detailUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                trade.name,
              )}</a></summary>
              <small>交易后持仓数量 -- · 交易后市值 -- · 资产占比影响 -- · ${escapeHtml(trade.note || trade.description || "无备注")}</small>
            </details>
          </td>
          <td><span class="code-pill">${escapeHtml(trade.code)}</span></td>
          <td><span class="status-badge trade-type-badge ${badgeClass}">${escapeHtml(trade.type)}</span></td>
          <td>${formatNumber(trade.price, 2)}</td>
          <td>${formatNumber(trade.quantity, 2)}</td>
          <td>${formatNumber(trade.amount, 2)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderReports() {
  const context = currentContext();
  const accountReport = {
    title: `${context.id === "ADMIN" ? "基金账户总览" : context.name} 账户报告`,
    period: DATA.fund.asOfDate,
    kind: "账户报告",
    type: "UI",
    size: "--",
    generatedAt: DATA.fund.asOfDate,
    file: "",
    disabled: true,
  };
  const reports = [accountReport, ...REPORTS];
  $("#reportsGrid").innerHTML = reports
    .map((report) => {
      const url = report.file ? `${REPORT_BASE}${report.file}` : "#";
      return `
        <article class="report-card">
          <div class="report-cover-label">
            <span>HSBG FUND</span>
            <strong>${escapeHtml(report.kind)}</strong>
            <p>${escapeHtml(report.period)}</p>
          </div>
          <div>
            <strong>${escapeHtml(report.title)}</strong>
            <small>${escapeHtml(report.type)} · ${escapeHtml(report.size)} · 生成日期 ${escapeHtml(report.generatedAt)}</small>
          </div>
          <div class="report-actions-inline">
            <span class="report-button disabled">预览</span>
            ${
              report.disabled
                ? `<span class="report-button disabled">下载</span>`
                : `<a class="report-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" download>下载</a>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAssumptions() {
  $("#assumptionText").textContent = (DATA.assumptions || []).join(" · ");
}

function renderApp() {
  const context = currentContext();
  if (!context) {
    setView(false);
    return;
  }
  renderVip(context);
  renderClientSelect();
  renderWealthHero(context);
  renderKpis(context);
  renderAssetOverview(context);
  renderAssetIncome(context);
  renderMarketSummary(context);
  renderNavChart();
  renderClientList(context);
  renderMarketFilters();
  renderTopHoldingsStrip(context);
  renderHoldings(context);
  renderHoldingDetails(context);
  renderDividends(context);
  renderLots(context);
  renderAnonymousSubscriptions();
  renderTradeFilters();
  renderTrades();
  renderReports();
  renderAssumptions();
}

function exportHoldingsCsv() {
  const context = currentContext();
  if (!context) return;
  const rows = holdingRows(context).map((item) => ({
    名称: item.name,
    市场: item.market,
    代码: item.code,
    最新价: item.isCash ? "" : item.price,
    用户市值: item.value,
    资产占比: item.userWeight,
    当日损益: item.userDayPnl,
    累计盈亏: item.userCumulativePnl,
  }));
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `HSBG-holdings-${context.id}-${DATA.fund.asOfDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function updateClock() {
  $("#clockLabel").textContent = new Date().toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

let autoRefreshTimer = null;

function syncAutoRefresh() {
  $("#autoRefreshToggle").checked = state.autoRefresh;
  localStorage.setItem("hsbg.autoRefresh", state.autoRefresh ? "1" : "0");
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  if (state.autoRefresh) {
    autoRefreshTimer = setInterval(async () => {
      if (DATA) await loadPortfolio(state.activeId).catch(() => window.location.reload());
    }, 60000);
  }
}

function closeMobileNav() {
  const sideNav = $("#sideNav");
  sideNav.classList.remove("open");
  sideNav.style.removeProperty("inset");
  sideNav.style.removeProperty("left");
  sideNav.style.removeProperty("transform");
  sideNav.style.removeProperty("translate");
  $("#sideOverlay").classList.add("hidden");
}

function openMobileNav() {
  const sideNav = $("#sideNav");
  sideNav.classList.add("open");
  sideNav.style.setProperty("transform", "translateX(300px)", "important");
  $("#sideOverlay").classList.remove("hidden");
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("#clientIdInput").value, $("#passwordInput").value);
  });

  $("#forgotPasswordButton").addEventListener("click", () => {
    $("#loginError").textContent = "请联系 HSBG 客户服务重置访问权限。";
  });

  $("#logoutButton").addEventListener("click", logout);
  $("#reloadButton").addEventListener("click", async () => {
    if (DATA) {
      await loadPortfolio(state.activeId);
    } else {
      skeleton($("#loginTopPerformers"), 6);
      PUBLIC_DATA = await api("/api/bootstrap");
      renderLoginSnapshot();
    }
  });

  $("#clientSelect").addEventListener("change", async (event) => {
    state.selectedHoldingCode = "";
    await loadPortfolio(event.target.value);
  });

  $("#holdingSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.showAllHoldings = false;
    renderTopHoldingsStrip(currentContext());
    renderHoldings(currentContext());
    renderHoldingDetails(currentContext());
  });

  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderTopHoldingsStrip(currentContext());
    renderHoldings(currentContext());
    renderHoldingDetails(currentContext());
  });

  $("#holdingLimitButton").addEventListener("click", () => {
    state.showAllHoldings = !state.showAllHoldings;
    renderHoldings(currentContext());
  });

  $("#exportHoldingsButton").addEventListener("click", exportHoldingsCsv);

  $("#autoRefreshToggle").addEventListener("change", (event) => {
    state.autoRefresh = event.target.checked;
    syncAutoRefresh();
  });

  $$("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.assetRange = button.dataset.range;
      $$("[data-range]").forEach((item) => item.classList.toggle("active", item === button));
      if (DATA) renderAssetIncome(currentContext());
    });
  });

  $("#mobileMenuButton").addEventListener("click", openMobileNav);
  $("#sideOverlay").addEventListener("click", closeMobileNav);
  $$(".section-nav a").forEach((link) => link.addEventListener("click", closeMobileNav));
}

async function init() {
  bindEvents();
  const remembered = localStorage.getItem(REMEMBER_ID_KEY);
  if (remembered) {
    $("#clientIdInput").value = remembered;
    $("#rememberClientId").checked = true;
  }
  updateClock();
  setInterval(updateClock, 1000);
  syncAutoRefresh();
  skeleton($("#loginTopPerformers"), 6);
  try {
    PUBLIC_DATA = await api("/api/bootstrap");
    renderLoginSnapshot();
  } catch {
    PUBLIC_DATA = { fund: { asOfDate: "", latestNav: { nav: 0 } }, marketSummary: [], navHistory: [] };
    $("#loginTopPerformers").innerHTML = `<div class="empty-state">暂时无法加载预览数据</div>`;
  }
  try {
    if (sessionStorage.getItem(AUTH_TOKEN_KEY)) {
      await loadPortfolio();
    } else {
      setView(false);
    }
  } catch {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    setView(false);
  }
}

document.addEventListener("DOMContentLoaded", init);
