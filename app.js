let PUBLIC_DATA = null;
let DATA = null;
const API_BASE =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? ""
    : "https://api.invest-hsbg.uk";
const AUTH_TOKEN_KEY = "hsbg.authToken";
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
  autoRefresh: localStorage.getItem("hsbg.autoRefresh") === "1",
};

const REPORTS = [
  {
    title: "2025 年第一季度投资总结报告",
    period: "2025 Q1",
    type: "PDF",
    file: "hsbg-2025-q1-investment-report.pdf",
  },
  {
    title: "2025 年第三季度路演报告",
    period: "2025 Q3",
    type: "PPTX",
    file: "hsbg-2025-q3.pptx",
  },
  {
    title: "2025 年度基金报告",
    period: "Annual 2025",
    type: "PDF",
    file: "hsbg-2025-annual-report-20260127.pdf",
  },
];

const DIVIDEND_DATES = {
  christmas2024: "2024-12-25",
  mid2025: "2025-06-11",
  specialJan2026: "2026-01-19",
  annual2025: "2026-01-28",
};

const MARKET_COLORS = {
  港股: "#16765f",
  A股: "#b7892a",
  美股: "#2a8d9a",
  现金: "#69736c",
  全市场: "#1f2522",
};

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
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function formatCurrency(value, digits = 0) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function formatPercent(value, digits = 2) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function tone(value) {
  if (Number(value) > 0) return "positive";
  if (Number(value) < 0) return "negative";
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

function setView(loggedIn) {
  $("#loginView").classList.toggle("hidden", loggedIn);
  $("#appView").classList.toggle("hidden", !loggedIn);
}

function marketItems(source = DATA || PUBLIC_DATA) {
  return (source?.marketSummary || []).filter((item) => item.market !== "全市场");
}

function renderLoginSnapshot() {
  if (!PUBLIC_DATA) return;
  $("#loginAsOf").textContent = `数据日 ${PUBLIC_DATA.fund.asOfDate}`;
  $("#loginNav").textContent = `NAV ${formatNumber(PUBLIC_DATA.fund.latestNav.nav, 4)}`;
  $("#loginTopPerformers").innerHTML = (PUBLIC_DATA.topPerformers || [])
    .map((item) => {
      const positive = Number(item.returnRate || 0) >= 0;
      return `
        <article class="performer-card">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.code)} · ${escapeHtml(item.market)}</span>
          </div>
          <b class="${positive ? "hot-positive" : "hot-negative"}">${formatPercent(item.returnRate, 2)}</b>
          <small>累计收益率 · 最新价 ${formatNumber(item.price, 2)} ${escapeHtml(item.currency)}</small>
          <a href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noopener noreferrer">查看详情</a>
        </article>
      `;
    })
    .join("");
  $("#loginMarketBars").innerHTML = marketItems(PUBLIC_DATA)
    .map((item) => {
      const width = Math.max(2, item.weight * 100);
      return `
        <div class="market-bar-row">
          <span>${escapeHtml(item.market)}</span>
          <div class="market-bar-track">
            <div class="market-bar-fill" style="width:${width}%;background:${MARKET_COLORS[item.market]}"></div>
          </div>
          <span>${formatPercent(item.weight, 1)}</span>
        </div>
      `;
    })
    .join("");
}

function renderIdStrip() {
  $("#idStrip").innerHTML = (PUBLIC_DATA?.loginIds || [])
    .map((item) => {
      const vip = item.tier?.isVip ? " vip" : "";
      const label = item.tier?.isVip ? `${item.id} · VIP` : item.id;
      return `<button class="id-chip${vip}" type="button" data-id="${escapeHtml(item.id)}" title="${escapeHtml(
        item.name,
      )}">${escapeHtml(label)}</button>`;
    })
    .join("");

  $$(".id-chip").forEach((button) => {
    button.addEventListener("click", () => {
      $("#clientIdInput").value = button.dataset.id;
      $("#passwordInput").value = "";
      $("#passwordInput").focus();
    });
  });
}

async function login(username, password) {
  $("#loginError").textContent = "";
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (result.token) sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
    state.activeId = result.user.id;
    await loadPortfolio(result.user.id);
  } catch (error) {
    const message = String(error.message || "");
    $("#loginError").textContent =
      message === "Failed to fetch" || message.includes("超时")
        ? "无法连接云端服务，请稍后重试或使用备用访问域名"
        : message;
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  DATA = null;
  state.activeId = "";
  setView(false);
  $("#clientIdInput").value = "";
  $("#passwordInput").value = "";
  $("#clientIdInput").focus();
}

async function loadPortfolio(clientId = "") {
  const requested = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  DATA = await api(`/api/portfolio${requested}`);
  state.activeId = DATA.context.id;
  setView(true);
  renderApp();
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

function kpi(label, value, detail, valueClass = "", extraClass = "") {
  return `
    <article class="kpi-card ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <strong class="${valueClass}">${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderVip(context) {
  const isVip = Boolean(context.tier?.isVip);
  document.body.classList.toggle("vip-mode", isVip);
  $("#vipCard").classList.toggle("hidden", !isVip);
  $("#tierBadge").classList.toggle("hidden", !context.tier);
  $("#tierBadge").textContent = context.tier?.label || "";
  $("#tierBadge").classList.toggle("vip", isVip);
}

function renderKpis(context) {
  const dividends = context.dividends || { total: 0, cumulativeWithDividends: context.floatingPnl };
  const cashDetail = `持仓 ${formatCurrency(context.positionValue)} / 现金 ${formatCurrency(context.cashValue)}`;
  const subscriptionDetail = context.todaySubscription
    ? `当日申购 ${formatCurrency(context.todaySubscription)}`
    : `成本 ${formatCurrency(context.totalInvested)}`;
  $("#summarySection").innerHTML = [
    kpi("当前市值", formatCurrency(context.currentValue), cashDetail),
    kpi("当日损益", formatCurrency(context.dayPnl), `数据日 ${DATA.fund.asOfDate}`, tone(context.dayPnl)),
    kpi("累计浮盈", formatCurrency(context.floatingPnl), formatPercent(context.returnRate), tone(context.floatingPnl)),
    kpi(
      "含分红累计收益",
      formatCurrency(dividends.cumulativeWithDividends),
      formatPercent(context.returnRateWithDividends),
      tone(dividends.cumulativeWithDividends),
      "dividend-card",
    ),
    kpi("累计分红", formatCurrency(dividends.total), "已分配现金收益", tone(dividends.total), "dividend-card"),
    kpi("确认份额", formatNumber(context.totalShares, 2), `份额占比 ${formatPercent(context.portfolioRatio)}`),
    kpi("投入本金", formatCurrency(context.totalInvested), subscriptionDetail),
  ].join("");
}

function renderMarketSummary(context) {
  $("#fundDayPnl").textContent = `当日 ${formatCurrency(context.dayPnl)}`;
  $("#fundDayPnl").className = `pill ${tone(context.dayPnl)}`;
  $("#marketSummary").innerHTML = marketItems(DATA)
    .map((item) => {
      const marketValue = item.marketValueCny * context.portfolioRatio;
      const dayPnl = item.dayPnlCny * context.dailyPnlRatio;
      const weight = context.currentValue ? marketValue / context.currentValue : 0;
      return `
        <div class="market-card">
          <div>
            <strong>${escapeHtml(item.market)}</strong>
            <small>${escapeHtml(item.note)}</small>
          </div>
          <div class="allocation-track" aria-label="${escapeHtml(item.market)} ${formatPercent(weight)}">
            <div class="allocation-fill" style="width:${Math.max(1, weight * 100)}%;background:${MARKET_COLORS[item.market]}"></div>
          </div>
          <div class="market-values">
            <b>${formatCurrency(marketValue)}</b>
            <small class="${tone(dayPnl)}">${formatCurrency(dayPnl)} · ${formatPercent(weight, 1)}</small>
          </div>
        </div>
      `;
    })
    .join("");
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
  if (!points.length) return "";
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
      return `<line x1="${padX}" y1="${gridY}" x2="${width - padX}" y2="${gridY}" stroke="#d7e3ef"/><text x="${padX - 8}" y="${gridY + 4}" text-anchor="end" fill="#6b7280" font-size="11">${formatNumber(value, options.digits ?? 0)}</text>`;
    })
    .join("");
  const dots = points
    .filter((_, index) => points.length <= 28 || index === points.length - 1 || index % Math.ceil(points.length / 10) === 0)
    .map(
      (item, index, visible) =>
        `<circle class="chart-dot" cx="${x(points.indexOf(item))}" cy="${y(Number(item[primary.key] || 0))}" r="${
          visible.length - 1 === index ? 5 : 3
        }"><title>${item.date} ${primary.label}: ${formatNumber(item[primary.key], options.digits ?? 0)} / ${
          secondary.label
        }: ${formatNumber(item[secondary.key], options.digits ?? 0)}</title></circle>`,
    )
    .join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label || "收益曲线")}">
      ${grid}
      <path class="income-line primary-line" d="${linePath(points, primary.key, x, y)}"></path>
      <path class="income-line secondary-line" d="${linePath(points, secondary.key, x, y)}"></path>
      ${dots}
      <text x="${padX}" y="${height - 10}" fill="#6b7280" font-size="12">${escapeHtml(points[0].date)}</text>
      <text x="${width - padX}" y="${height - 10}" text-anchor="end" fill="#6b7280" font-size="12">${escapeHtml(
        points.at(-1).date,
      )}</text>
    </svg>
    <div class="chart-legend">
      <span class="chart-legend-item primary-line">${escapeHtml(primary.label)}</span>
      <span class="chart-legend-item secondary-line">${escapeHtml(secondary.label)}</span>
    </div>
  `;
}

function singleLineChart(points, key, options = {}) {
  if (!points.length) return "";
  const normalized = points.map((item) => ({ ...item, zero: 0 }));
  return dualLineChart(
    normalized,
    { key, label: options.label || "每万份收益" },
    { key: "zero", label: "0" },
    { width: 460, height: 220, digits: 2, label: options.label || "每万份收益" },
  );
}

function renderWealthHero(context) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好";
  $("#welcomeLine").textContent = `${greeting}，${context.name}`;
  $("#heroMeta").textContent = `当前账户 ${context.id} · 数据日 ${DATA.fund.asOfDate} · ${context.tier?.label || "Member"}`;
}

function renderAssetOverview(context) {
  const dividends = context.dividends || { cumulativeWithDividends: context.floatingPnl };
  const rows = [
    {
      label: "人民币总资产（元）",
      marker: "=",
      value: context.currentValue,
      income: dividends.cumulativeWithDividends,
      day: context.dayPnl,
      total: true,
    },
    { label: "现金账户资产", marker: "■", value: context.cashValue, income: 0, day: 0 },
    { label: "基金资产", marker: "■", value: context.positionValue, income: dividends.cumulativeWithDividends, day: context.dayPnl },
    { label: "个人养老金资产", marker: "+", value: 0, income: 0, day: 0 },
    { label: "投顾资产", marker: "+", value: 0, income: 0, day: 0 },
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
  $("#tenkTotal").textContent = `今年以来累计 ${formatNumber(yearSum, 2)}`;
  $("#tenkTotal").className = tone(yearSum);
  $("#tenkChart").innerHTML = singleLineChart(tenK.slice(-30), "perTenK", { label: "每万份收益" });
}

function renderAssetIncome(context) {
  const points = filterSeriesByRange(clientAssetSeries(context), state.assetRange);
  $("#assetIncomeChart").innerHTML = dualLineChart(
    points.map((item) => ({ ...item, assetWan: item.asset / 10000 })),
    { key: "assetWan", label: "总资产(万元)" },
    { key: "income", label: "总收益(元)" },
    { label: "资产收益图", digits: 2 },
  );
  renderMarketPie(context);
}

function renderMarketPie(context) {
  const rows = [
    ...marketItems(DATA).map((item) => ({
      label: item.market,
      value: item.marketValueCny * context.portfolioRatio,
      color: MARKET_COLORS[item.market] || "#1f2522",
    })),
    { label: "现金", value: context.cashValue, color: MARKET_COLORS["现金"] },
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
    <div class="pie-disc" style="background: conic-gradient(${gradient})"></div>
    <div class="pie-legend">
      ${rows
        .map(
          (item) => `
            <span><i style="background:${item.color}"></i>${escapeHtml(item.label)} ${formatPercent(item.value / total, 2)}</span>
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
    $("#navChart").innerHTML = "";
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
  const first = points[0];
  const grid = [0, 0.5, 1]
    .map((ratio) => {
      const gridY = padTop + ratio * (height - padTop - padBottom);
      const value = max - ratio * span;
      return `<line x1="${padX}" y1="${gridY}" x2="${width - padX}" y2="${gridY}" stroke="#dfe4db"/><text x="${padX}" y="${gridY - 5}" fill="#69736c" font-size="11">${formatNumber(value, 1)}</text>`;
    })
    .join("");
  const pointNodes = points
    .map((item, index) => {
      return `<circle class="nav-point" cx="${x(index)}" cy="${y(item.fundTotalReturnIndex)}" r="4" data-date="${escapeHtml(
        item.date,
      )}" data-fund="${item.fundTotalReturnIndex}" data-price="${item.fundPriceIndex}" data-benchmark="${
        item.weightedBenchmarkIndex
      }" data-excess="${item.excessReturn || 0}"></circle>`;
    })
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
      <text x="${padX}" y="${height - 12}" fill="#69736c" font-size="12">${escapeHtml(first.date)}</text>
      <text x="${width - padX}" y="${height - 12}" text-anchor="end" fill="#69736c" font-size="12">${escapeHtml(latest.date)}</text>
      <text x="${x(points.length - 1) - 8}" y="${y(latest.fundTotalReturnIndex) - 12}" text-anchor="end" fill="#1f2522" font-size="13" font-weight="700">${formatNumber(
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

function renderClientList(context) {
  const clients = isAdminSession() ? DATA.clients : [context];
  $("#clientList").innerHTML = clients
    .map((client) => {
      const vip = client.tier?.isVip ? `<span class="mini-vip">VIP</span>` : "";
      const action = isAdminSession()
        ? `<button type="button" data-client-jump="${escapeHtml(client.id)}">查看</button>`
        : `<span class="current-chip">当前</span>`;
      return `
        <div class="client-row ${client.tier?.isVip ? "vip-client-row" : ""}">
          <div>
            <strong>${escapeHtml(client.name)} ${vip}</strong>
            <small>${escapeHtml(client.id)} · ${formatCurrency(client.currentValue)} · ${formatPercent(
              client.portfolioRatio,
            )}</small>
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
        `<button type="button" class="filter-button${state.market === market ? " active" : ""}" data-market="${escapeHtml(
          market,
        )}">${escapeHtml(market)}</button>`,
    )
    .join("");
  $$(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.market = button.dataset.market;
      renderHoldings(currentContext());
      renderHoldingDetails(currentContext());
      renderMarketFilters();
    });
  });
}

function holdingRows(context) {
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
    isCash: true,
  });

  const term = state.search.trim().toLowerCase();
  return rows
    .filter((item) => state.market === "全部" || item.market === state.market)
    .filter((item) => {
      if (!term) return true;
      return [item.name, item.code, item.market].some((value) => String(value).toLowerCase().includes(term));
    })
    .sort((a, b) => {
      if (state.sort === "dayPnl") return a.userDayPnl - b.userDayPnl;
      if (state.sort === "floatingPnl") return a.userFloatingPnl - b.userFloatingPnl;
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

function renderHoldings(context) {
  const rows = holdingRows(context);
  if (!rows.length) {
    $("#holdingsBody").innerHTML = `<tr><td colspan="10" class="name-cell">无匹配持仓</td></tr>`;
    return;
  }
  $("#holdingsBody").innerHTML = rows
    .map((item) => {
      const marketColor = MARKET_COLORS[item.market] || MARKET_COLORS["全市场"];
      const priceText = item.isCash ? "--" : `${formatNumber(item.price, 2)} ${item.currency}`;
      const changeText = item.isCash ? "--" : item.change.raw;
      return `
        <tr>
          <td class="name-cell">${stockNameCell(item)}</td>
          <td><span class="market-tag" style="background:${marketColor}">${escapeHtml(item.market)}</span></td>
          <td><span class="code-pill">${escapeHtml(item.code)}</span></td>
          <td>${escapeHtml(priceText)}</td>
          <td class="${tone(item.change.amount)}">${escapeHtml(changeText)}</td>
          <td>${formatCurrency(item.value)}</td>
          <td>${formatPercent(item.userWeight, 2)}</td>
          <td class="${tone(item.userDayPnl)}">${formatCurrency(item.userDayPnl)}</td>
          <td class="${tone(item.userFloatingPnl)}">${formatCurrency(item.userFloatingPnl)}</td>
          <td class="${tone(item.userCumulativePnl)}">${formatCurrency(item.userCumulativePnl)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderDividends(context) {
  const dividends = context.dividends || { detail: {}, labels: {}, total: 0, cumulativeWithDividends: 0 };
  $("#dividendTotal").textContent = `合计 ${formatCurrency(dividends.total)}`;
  $("#dividendTotal").className = `pill ${tone(dividends.total)}`;
  const rows = Object.entries(dividends.detail || {}).map(([key, value]) => {
    return `
      <div class="dividend-row">
        <span>${escapeHtml(dividends.labels?.[key] || key)}</span>
        <strong class="${tone(value)}">${formatCurrency(value)}</strong>
      </div>
    `;
  });
  rows.push(`
    <div class="dividend-row total">
      <span>含分红累计收益</span>
      <strong class="${tone(dividends.cumulativeWithDividends)}">${formatCurrency(dividends.cumulativeWithDividends)}</strong>
    </div>
  `);
  $("#dividendSummary").innerHTML = rows.join("");
}

function renderLots(context) {
  const rows = context.lots || [];
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
          <td class="name-cell">${escapeHtml(note)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAnonymousSubscriptions() {
  const rows = DATA?.anonymousSubscriptions || [];
  const body = $("#anonymousSubscriptionsBody");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="name-cell">暂无其他客户加仓记录</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .slice(0, 18)
    .map((lot) => {
      const tag = lot.isAsOfDateSubscription ? `<span class="fresh-tag">当日</span>` : "";
      return `
        <tr>
          <td>${escapeHtml(lot.date)}</td>
          <td class="name-cell">${escapeHtml(lot.label)} ${tag}</td>
          <td>${formatCurrency(lot.investment)}</td>
          <td>${formatNumber(lot.shares, 2)}</td>
          <td>${formatNumber(lot.buyNav, 4)}</td>
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
  const drift = current - previous;
  const values = [previous, previous + drift * 0.16, previous + drift * 0.34, previous + drift * 0.52, previous + drift * 0.76, current];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 280;
  const height = 88;
  const x = (index) => 12 + (index / Math.max(values.length - 1, 1)) * (width - 24);
  const y = (value) => 12 + (1 - (value - min) / span) * (height - 24);
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(item.name)} 当日走势">
      <line x1="12" y1="44" x2="${width - 12}" y2="44" stroke="#e5edf5"></line>
      <path d="${path}" class="spark-path ${change >= 0 ? "spark-up" : "spark-down"}"></path>
    </svg>
  `;
}

function renderHoldingDetails(context) {
  const rows = holdingRows(context)
    .filter((item) => !item.isCash)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  $("#holdingDetailList").innerHTML = rows
    .map(
      (item) => `
        <article class="holding-detail-card">
          <div class="holding-title-row">
            <div>
              ${stockNameCell(item)}
              <span class="code-pill">${escapeHtml(item.code)}</span>
            </div>
            <a class="detail-button" href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noopener noreferrer">详情</a>
          </div>
          <div class="holding-detail-grid">
            <span>最新市值 <b>${formatCurrency(item.value)}</b></span>
            <span>持有数量 <b>${formatNumber(item.userQuantity, 2)}</b></span>
            <span>最新价 <b>${formatNumber(item.price, 2)} ${escapeHtml(item.currency)}</b></span>
            <span>当日涨跌 <b class="${tone(item.change.amount)}">${escapeHtml(item.change.raw)}</b></span>
            <span>持仓收益 <b class="${tone(item.userCumulativePnl)}">${formatCurrency(item.userCumulativePnl)}</b></span>
            <span>资产占比 <b>${formatPercent(item.userWeight, 2)}</b></span>
          </div>
          <div class="holding-spark">${holdingSparkline(item)}</div>
        </article>
      `,
    )
    .join("");
}

function renderReports() {
  $("#reportsGrid").innerHTML = REPORTS.map(
    (report) => `
      <a class="report-card" href="${escapeHtml(`${REPORT_BASE}${report.file}`)}" target="_blank" rel="noopener noreferrer" download>
        <span>${escapeHtml(report.period)}</span>
        <strong>${escapeHtml(report.title)}</strong>
        <small>${escapeHtml(report.type)} · 下载</small>
      </a>
    `,
  ).join("");
}

function renderTrades() {
  $("#tradesBody").innerHTML = DATA.recentTrades
    .slice(0, 28)
    .map(
      (trade) => `
        <tr>
          <td>${escapeHtml(trade.date)}</td>
          <td class="name-cell"><a class="stock-link" href="${escapeHtml(trade.detailUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            trade.name,
          )}</a> <span class="code-pill">${escapeHtml(trade.code)}</span></td>
          <td>${escapeHtml(trade.type)}</td>
          <td>${formatNumber(trade.price, 2)}</td>
          <td>${formatNumber(trade.quantity, 2)}</td>
          <td>${formatNumber(trade.amount, 2)}</td>
        </tr>
      `,
    )
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
  $("#asOfLabel").textContent = `数据日 ${DATA.fund.asOfDate} · ${DATA.fund.sourceFile}`;
  $("#clientTitle").textContent = `${context.name} · ${context.id}`;
  renderVip(context);
  renderClientSelect();
  renderWealthHero(context);
  renderAssetOverview(context);
  renderKpis(context);
  renderAssetIncome(context);
  renderMarketSummary(context);
  renderNavChart();
  renderClientList(context);
  renderMarketFilters();
  renderHoldings(context);
  renderDividends(context);
  renderLots(context);
  renderAnonymousSubscriptions();
  renderHoldingDetails(context);
  renderReports();
  renderTrades();
  renderAssumptions();
}

function updateClock() {
  const now = new Date();
  $("#clockLabel").textContent = now.toLocaleString("zh-CN", {
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
      if (DATA) {
        await loadPortfolio(state.activeId).catch(() => window.location.reload());
      }
    }, 60000);
  }
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("#clientIdInput").value, $("#passwordInput").value);
  });

  $("#logoutButton").addEventListener("click", logout);
  $("#reloadButton").addEventListener("click", async () => {
    if (DATA) {
      await loadPortfolio(state.activeId);
    } else {
      PUBLIC_DATA = await api("/api/bootstrap");
      renderLoginSnapshot();
    }
  });

  $("#clientSelect").addEventListener("change", async (event) => {
    await loadPortfolio(event.target.value);
  });

  $("#holdingSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderHoldings(currentContext());
    renderHoldingDetails(currentContext());
  });

  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderHoldings(currentContext());
    renderHoldingDetails(currentContext());
  });

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
}

async function init() {
  bindEvents();
  updateClock();
  setInterval(updateClock, 1000);
  syncAutoRefresh();
  try {
    PUBLIC_DATA = await api("/api/bootstrap");
    renderLoginSnapshot();
  } catch (error) {
    PUBLIC_DATA = { fund: { asOfDate: "", latestNav: { nav: 0 } }, marketSummary: [], navHistory: [] };
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
