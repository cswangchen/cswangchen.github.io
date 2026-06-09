let PUBLIC_DATA = null;
let DATA = null;
const API_BASE =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? ""
    : "https://api.invest-hsbg.uk";
const AUTH_TOKEN_KEY = "hsbg.authToken";

const state = {
  activeId: "",
  market: "全部",
  search: "",
  sort: "value",
  autoRefresh: localStorage.getItem("hsbg.autoRefresh") === "1",
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

function renderNavChart() {
  const points = (DATA?.navHistory || PUBLIC_DATA?.navHistory || []).filter((item) => item.nav > 0).slice(-24);
  if (!points.length) {
    $("#navChart").innerHTML = "";
    return;
  }
  const width = 640;
  const height = 230;
  const padX = 36;
  const padTop = 24;
  const padBottom = 38;
  const navs = points.map((item) => item.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const span = max - min || 1;
  const x = (index) => padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
  const y = (value) => padTop + (1 - (value - min) / span) * (height - padTop - padBottom);
  const line = points.map((item, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(item.nav)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${height - padBottom} L ${x(0)} ${height - padBottom} Z`;
  const latest = points.at(-1);
  const first = points[0];
  const grid = [0, 0.5, 1]
    .map((ratio) => {
      const gridY = padTop + ratio * (height - padTop - padBottom);
      const value = max - ratio * span;
      return `<line x1="${padX}" y1="${gridY}" x2="${width - padX}" y2="${gridY}" stroke="#dfe4db"/><text x="${padX}" y="${gridY - 5}" fill="#69736c" font-size="11">${formatNumber(value, 3)}</text>`;
    })
    .join("");
  const pointNodes = points
    .map((item, index) => {
      return `<circle class="nav-point" cx="${x(index)}" cy="${y(item.nav)}" r="4" data-date="${escapeHtml(
        item.date,
      )}" data-nav="${item.nav}" data-asset="${item.totalAsset || 0}"></circle>`;
    })
    .join("");

  $("#navChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="单位净值走势">
      ${grid}
      <path d="${area}" class="nav-area"></path>
      <path d="${line}" class="nav-line"></path>
      ${pointNodes}
      <text x="${padX}" y="${height - 12}" fill="#69736c" font-size="12">${escapeHtml(first.date)}</text>
      <text x="${width - padX}" y="${height - 12}" text-anchor="end" fill="#69736c" font-size="12">${escapeHtml(latest.date)}</text>
      <text x="${x(points.length - 1) - 8}" y="${y(latest.nav) - 12}" text-anchor="end" fill="#1f2522" font-size="13" font-weight="700">${formatNumber(latest.nav, 4)}</text>
    </svg>
    <div class="nav-tooltip hidden" id="navTooltip"></div>
  `;

  const tooltip = $("#navTooltip");
  $$(".nav-point", $("#navChart")).forEach((point) => {
    point.addEventListener("mouseenter", () => {
      tooltip.classList.remove("hidden");
      tooltip.innerHTML = `
        <strong>${escapeHtml(point.dataset.date)}</strong>
        <span>NAV ${formatNumber(point.dataset.nav, 4)}</span>
        <small>总资产 ${formatCurrency(point.dataset.asset)}</small>
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
  renderKpis(context);
  renderMarketSummary(context);
  renderNavChart();
  renderClientList(context);
  renderMarketFilters();
  renderHoldings(context);
  renderDividends(context);
  renderLots(context);
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
  });

  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderHoldings(currentContext());
  });

  $("#autoRefreshToggle").addEventListener("change", (event) => {
    state.autoRefresh = event.target.checked;
    syncAutoRefresh();
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
