import { getRuleRecommendations } from './recommender.js';

const STORAGE_KEYS = {
  THEME: 'bitebudget_theme',
  GOALS: 'bitebudget_goals',
  LOGS: 'bitebudget_logs_by_date',
};

const DEFAULT_GOALS = {
  budget: 300,
  protein: 100,
  calories: 2000,
};

// 全域狀態
let foodDatabase = [];
let goals = loadJSON(STORAGE_KEYS.GOALS, DEFAULT_GOALS);
let logsByDate = loadJSON(STORAGE_KEYS.LOGS, {});
let activeCategory = '全部';
let searchQuery = '';
let currentRecommendations = [];

// 取得台灣本地日期 Key (YYYY-MM-DD)，避免跨午夜 UTC 時差問題
function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTodayLogs() {
  const key = getTodayKey();
  if (!logsByDate[key]) logsByDate[key] = [];
  return logsByDate[key];
}

// ---------- 淺色／深色模式切換 ----------
function syncThemeIcons() {
  const isDark = document.documentElement.classList.contains('dark');
  document.getElementById('icon-sun').classList.toggle('hidden', !isDark);
  document.getElementById('icon-moon').classList.toggle('hidden', isDark);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
  syncThemeIcons();
}

// ---------- Toast 提示 ----------
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  const colorClass =
    type === 'error'
      ? 'bg-rose-600 text-white'
      : type === 'warn'
        ? 'bg-amber-500 text-white'
        : 'bg-slate-900 dark:bg-emerald-600 text-white';

  el.className = `toast-item px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium shadow-lg ${colorClass}`;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 2400);
}

// ---------- 新增與刪除餐點紀錄 ----------
function addMeal({ name, price, calories, protein, source = '內建清單' }) {
  const todayKey = getTodayKey();
  if (!logsByDate[todayKey]) logsByDate[todayKey] = [];

  const timeStr = new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  logsByDate[todayKey].unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    price: Math.max(0, Number(price) || 0),
    calories: Math.max(0, Number(calories) || 0),
    protein: Math.max(0, Math.round((Number(protein) || 0) * 10) / 10),
    source,
    time: timeStr,
  });

  saveJSON(STORAGE_KEYS.LOGS, logsByDate);
  renderAll();
  showToast(`已加入：${name}`);
}

function deleteMeal(id) {
  const todayKey = getTodayKey();
  logsByDate[todayKey] = getTodayLogs().filter((item) => item.id !== id);
  saveJSON(STORAGE_KEYS.LOGS, logsByDate);
  renderAll();
  showToast('已刪除該筆紀錄', 'warn');
}

function clearTodayLogs() {
  const logs = getTodayLogs();
  if (logs.length === 0) return;
  if (!confirm('確定要清空今日所有飲食紀錄嗎？')) return;

  logsByDate[getTodayKey()] = [];
  saveJSON(STORAGE_KEYS.LOGS, logsByDate);
  renderAll();
  showToast('已清空今日紀錄', 'warn');
}

// ---------- 儀表板計算與紅黃綠燈渲染 ----------
function setBadgeStyle(el, text, level) {
  el.textContent = text;
  const styles = {
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  };
  el.className = `status-badge ${styles[level]}`;
}

function getSummaryStats() {
  const logs = getTodayLogs();
  const usedBudget = logs.reduce((sum, x) => sum + x.price, 0);
  const usedCalories = logs.reduce((sum, x) => sum + x.calories, 0);
  const usedProtein = Math.round(logs.reduce((sum, x) => sum + x.protein, 0) * 10) / 10;

  return {
    usedBudget,
    usedCalories,
    usedProtein,
    remainingBudget: goals.budget - usedBudget,
    proteinGap: Math.max(0, Math.round((goals.protein - usedProtein) * 10) / 10),
    caloriesGap: goals.calories - usedCalories,
  };
}

function renderDashboard() {
  const stats = getSummaryStats();

  // 1. 預算進度條
  const budgetPct = Math.min((stats.usedBudget / Math.max(goals.budget, 1)) * 100, 100);
  document.getElementById('budget-used').textContent = `$${stats.usedBudget}`;
  document.getElementById('budget-goal').textContent = goals.budget;
  document.getElementById('budget-remaining').textContent =
    stats.remainingBudget >= 0
      ? `今日剩餘 $${stats.remainingBudget}`
      : `已超支 $${Math.abs(stats.remainingBudget)}`;

  const budgetBar = document.getElementById('budget-bar');
  const budgetBadge = document.getElementById('budget-badge');
  budgetBar.style.width = `${budgetPct}%`;

  if (stats.usedBudget > goals.budget) {
    budgetBar.className = 'progress-fill bg-rose-500';
    setBadgeStyle(budgetBadge, '預算超支', 'red');
  } else if (budgetPct >= 80) {
    budgetBar.className = 'progress-fill bg-amber-500';
    setBadgeStyle(budgetBadge, '接近上限', 'yellow');
  } else {
    budgetBar.className = 'progress-fill bg-emerald-500';
    setBadgeStyle(budgetBadge, '控管良好', 'green');
  }

  // 2. 蛋白質進度條
  const proteinPct = Math.min((stats.usedProtein / Math.max(goals.protein, 1)) * 100, 100);
  document.getElementById('protein-used').textContent = `${stats.usedProtein}g`;
  document.getElementById('protein-goal').textContent = goals.protein;
  document.getElementById('protein-gap').textContent =
    stats.proteinGap > 0 ? `距離目標尚缺 ${stats.proteinGap}g` : '太棒了！今日蛋白質已達標';

  const proteinBar = document.getElementById('protein-bar');
  const proteinBadge = document.getElementById('protein-badge');
  proteinBar.style.width = `${proteinPct}%`;

  if (proteinPct >= 80) {
    proteinBar.className = 'progress-fill bg-emerald-500';
    setBadgeStyle(proteinBadge, proteinPct >= 100 ? '已達標' : '接近達標', 'green');
  } else if (proteinPct >= 40) {
    proteinBar.className = 'progress-fill bg-amber-500';
    setBadgeStyle(proteinBadge, '持續補充', 'yellow');
  } else {
    proteinBar.className = 'progress-fill bg-rose-500';
    setBadgeStyle(proteinBadge, '嚴重不足', 'red');
  }

  // 3. 熱量進度條
  const calPct = Math.min((stats.usedCalories / Math.max(goals.calories, 1)) * 100, 100);
  document.getElementById('calories-used').textContent = stats.usedCalories;
  document.getElementById('calories-goal').textContent = goals.calories;
  document.getElementById('calories-gap').textContent =
    stats.caloriesGap >= 0
      ? `尚可攝取 ${stats.caloriesGap} kcal`
      : `已超出目標 ${Math.abs(stats.caloriesGap)} kcal`;

  const calBar = document.getElementById('calories-bar');
  const calBadge = document.getElementById('calories-badge');
  calBar.style.width = `${calPct}%`;

  if (stats.usedCalories > goals.calories * 1.1) {
    calBar.className = 'progress-fill bg-rose-500';
    setBadgeStyle(calBadge, '熱量超標', 'red');
  } else if (calPct >= 85) {
    calBar.className = 'progress-fill bg-amber-500';
    setBadgeStyle(calBadge, '接近上限', 'yellow');
  } else {
    calBar.className = 'progress-fill bg-sky-500';
    setBadgeStyle(calBadge, '範圍內', 'blue');
  }

  // 4. 綜合雷達一句話提示
  const statusEl = document.getElementById('radar-status-text');
  if (stats.remainingBudget < 0) {
    statusEl.textContent = '⚠️ 今日餐費已超支，建議停止額外消費。';
  } else if (stats.proteinGap > 0) {
    statusEl.textContent = `剩餘 $${stats.remainingBudget}，還缺 ${stats.proteinGap}g 蛋白質，可參考下方推薦組合。`;
  } else {
    statusEl.textContent = `✅ 蛋白質已達標且預算尚餘 $${stats.remainingBudget}，今天吃得很穩！`;
  }
}

// ---------- 剩餘額度推薦渲染 ----------
function renderRecommendations() {
  const stats = getSummaryStats();
  const result = getRuleRecommendations(foodDatabase, stats);
  currentRecommendations = result.items;

  document.getElementById('recommend-summary').textContent = result.message;
  const listEl = document.getElementById('recommend-list');

  if (result.items.length === 0) {
    listEl.innerHTML = `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400 text-center">暫無可推薦的組合</div>`;
    return;
  }

  listEl.innerHTML = result.items
    .map(
      (rec, idx) => `
      <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-bold truncate">${escapeHTML(rec.title)}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span class="font-semibold text-emerald-600 dark:text-emerald-400">$${rec.totalPrice}</span>
            · ${rec.totalProtein}g 蛋白 · ${rec.totalCalories} kcal
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">${escapeHTML(rec.reason)}</div>
        </div>
        <button data-rec-index="${idx}" type="button"
          class="add-rec-btn shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition">
          一鍵加入
        </button>
      </div>
    `
    )
    .join('');
}

// ---------- 台灣外食快速點選 ----------
function renderCategoryTabs() {
  const categories = ['全部', ...new Set(foodDatabase.map((f) => f.category))];
  const tabsEl = document.getElementById('category-tabs');

  tabsEl.innerHTML = categories
    .map((cat) => {
      const isActive = cat === activeCategory;
      const cls = isActive
        ? 'bg-emerald-500 text-white border-emerald-500'
        : 'bg-transparent text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800';
      return `<button data-category="${escapeHTML(cat)}" type="button" class="cat-tab px-3 py-1 text-xs font-medium rounded-full border transition ${cls}">${escapeHTML(cat)}</button>`;
    })
    .join('');
}

function renderFoodGrid() {
  const q = searchQuery.trim().toLowerCase();
  const filtered = foodDatabase.filter((f) => {
    const matchCat = activeCategory === '全部' || f.category === activeCategory;
    const matchText =
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.tags.some((t) => t.toLowerCase().includes(q));
    return matchCat && matchText;
  });

  const gridEl = document.getElementById('food-grid');
  if (filtered.length === 0) {
    gridEl.innerHTML = `<p class="col-span-full text-center text-sm text-slate-400 py-6">找不到符合「${escapeHTML(searchQuery)}」的外食項目，可用上方手動自訂新增。</p>`;
    return;
  }

  gridEl.innerHTML = filtered
    .map(
      (f) => `
      <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500 transition flex flex-col justify-between gap-2.5 bg-slate-50/50 dark:bg-slate-950/40">
        <div>
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-bold leading-snug">${escapeHTML(f.name)}</h3>
            <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0">$${f.price}</span>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            蛋白 <strong class="text-slate-700 dark:text-slate-200">${f.protein}g</strong> · ${f.calories} kcal
          </div>
          <div class="flex flex-wrap gap-1 mt-2">
            ${f.tags
              .map(
                (t) =>
                  `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${escapeHTML(t)}</span>`
              )
              .join('')}
          </div>
        </div>
        <button data-food-id="${escapeHTML(f.id)}" type="button"
          class="quick-add-btn w-full py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-emerald-500 dark:hover:bg-emerald-500 text-white transition">
          ＋ 加入今日紀錄
        </button>
      </div>
    `
    )
    .join('');
}

// ---------- 今日紀錄清單渲染 ----------
function renderTodayLogs() {
  const logs = getTodayLogs();
  document.getElementById('log-count').textContent = `${logs.length} 筆`;
  const listEl = document.getElementById('log-list');

  if (logs.length === 0) {
    listEl.innerHTML = `<p class="py-8 text-center text-sm text-slate-400">今天還沒有飲食紀錄，從上方點選餐點或輸入文字開始記錄吧！</p>`;
    return;
  }

  listEl.innerHTML = logs
    .map(
      (item) => `
      <div class="py-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold truncate">${escapeHTML(item.name)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">${escapeHTML(item.source)}</span>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ${item.time} · 蛋白質 ${item.protein}g · ${item.calories} kcal
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-sm font-bold">$${item.price}</span>
          <button data-delete-id="${escapeHTML(item.id)}" type="button"
            class="delete-log-btn text-xs px-2 py-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition">
            刪除
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

// ---------- Phase 1 離線語意比對（Phase 2 將優先呼叫 Gemini API，失敗時降級至此） ----------
function parseMealLocally(text) {
  const keywordMap = [
    { keywords: ['茶葉蛋', '水煮蛋'], id: 'cvs-01' },
    { keywords: ['無糖豆漿', '高蛋白豆漿', '豆漿', '豆奶'], id: 'cvs-02' },
    { keywords: ['雞胸', '舒肥雞'], id: 'cvs-03' },
    { keywords: ['御飯糰', '飯糰'], id: 'cvs-04' },
    { keywords: ['三明治'], id: 'cvs-05' },
    { keywords: ['地瓜', '烤地瓜'], id: 'cvs-06' },
    { keywords: ['優格', '希臘優格'], id: 'cvs-07' },
    { keywords: ['義大利麵'], id: 'cvs-08' },
    { keywords: ['健康餐', '雞胸餐盒'], id: 'bento-01' },
    { keywords: ['滷雞腿', '雞腿便當'], id: 'bento-02' },
    { keywords: ['排骨便當', '炸排骨'], id: 'bento-03' },
    { keywords: ['自助餐'], id: 'bento-04' },
    { keywords: ['鯖魚'], id: 'bento-05' },
    { keywords: ['牛肉麵'], id: 'noodle-01' },
    { keywords: ['陽春麵', '乾麵'], id: 'noodle-02' },
    { keywords: ['嘴邊肉'], id: 'noodle-03' },
    { keywords: ['燙青菜', '青菜'], id: 'noodle-04' },
    { keywords: ['滷味', '滷豆腐', '滷蛋'], id: 'noodle-05' },
    { keywords: ['水餃'], id: 'noodle-06' },
    { keywords: ['蛋白飲', '乳清'], id: 'drink-01' },
  ];

  // 將句子依常見連接詞分段，讓數量偵測更準確
  const segments = text.split(/[加跟和與、,+＋\s]+/).filter(Boolean);
  const matchedItems = [];

  for (const seg of segments) {
    const rule = keywordMap.find((r) => r.keywords.some((k) => seg.includes(k)));
    if (!rule) continue;

    const food = foodDatabase.find((f) => f.id === rule.id);
    if (!food) continue;

    // 偵測簡易數量（如 2顆、兩顆、3杯）
    let qty = 1;
    const digitMatch = seg.match(/(\d+)/);
    if (digitMatch) {
      qty = Math.min(Math.max(parseInt(digitMatch[1], 10), 1), 10);
    } else if (/[兩二]/.test(seg)) {
      qty = 2;
    } else if (/三/.test(seg)) {
      qty = 3;
    }

    matchedItems.push({
      name: qty > 1 ? `${food.name} x${qty}` : food.name,
      price: food.price * qty,
      calories: food.calories * qty,
      protein: Math.round(food.protein * qty * 10) / 10,
    });
  }

  return matchedItems;
}

function handleAIParse(e) {
  e.preventDefault();
  const input = document.getElementById('ai-input');
  const feedback = document.getElementById('ai-feedback');
  const text = input.value.trim();
  if (!text) return;

  const parsed = parseMealLocally(text);
  feedback.classList.remove('hidden');

  if (parsed.length === 0) {
    feedback.className =
      'text-xs rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
    feedback.textContent =
      '離線關鍵字比對找不到對應品項，請先用下方「手動自訂餐點」輸入，或等待 Phase 2 接入 Gemini API 支援任意外食。';
    return;
  }

  parsed.forEach((item) => addMeal({ ...item, source: '離線解析' }));
  feedback.className =
    'text-xs rounded-lg p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
  feedback.textContent = `已透過離線備援規則解析並加入 ${parsed.length} 筆餐點：${parsed.map((p) => p.name).join('、')}`;
  input.value = '';
}

// ---------- 目標設定 Modal ----------
function openSettingsModal() {
  document.getElementById('input-budget-goal').value = goals.budget;
  document.getElementById('input-protein-goal').value = goals.protein;
  document.getElementById('input-calories-goal').value = goals.calories;
  const modal = document.getElementById('settings-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function handleSaveSettings(e) {
  e.preventDefault();
  goals = {
    budget: Math.max(50, Number(document.getElementById('input-budget-goal').value) || 300),
    protein: Math.max(20, Number(document.getElementById('input-protein-goal').value) || 100),
    calories: Math.max(800, Number(document.getElementById('input-calories-goal').value) || 2000),
  };
  saveJSON(STORAGE_KEYS.GOALS, goals);
  closeSettingsModal();
  renderAll();
  showToast('每日目標已更新');
}

// ---------- 總渲染與初始化 ----------
function renderAll() {
  renderDashboard();
  renderRecommendations();
  renderTodayLogs();
}

function bindEvents() {
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('open-settings-btn').addEventListener('click', openSettingsModal);
  document.getElementById('close-settings-btn').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
  });

  document.getElementById('ai-form').addEventListener('submit', handleAIParse);
  document.getElementById('refresh-recommend-btn').addEventListener('click', () => {
    renderRecommendations();
    showToast('已依最新剩餘額度更新推薦');
  });

  document.getElementById('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addMeal({
      name: document.getElementById('manual-name').value,
      price: document.getElementById('manual-price').value,
      calories: document.getElementById('manual-calories').value,
      protein: document.getElementById('manual-protein').value,
      source: '手動自訂',
    });
    e.target.reset();
  });

  document.getElementById('food-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderFoodGrid();
  });

  document.getElementById('category-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    activeCategory = btn.dataset.category;
    renderCategoryTabs();
    renderFoodGrid();
  });

  document.getElementById('food-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-add-btn');
    if (!btn) return;
    const food = foodDatabase.find((f) => f.id === btn.dataset.foodId);
    if (food) addMeal({ ...food, source: '內建清單' });
  });

  document.getElementById('recommend-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.add-rec-btn');
    if (!btn) return;
    const rec = currentRecommendations[Number(btn.dataset.recIndex)];
    if (!rec) return;
    rec.foods.forEach((f) => addMeal({ ...f, source: '智慧推薦' }));
  });

  document.getElementById('log-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-log-btn');
    if (!btn) return;
    deleteMeal(btn.dataset.deleteId);
  });

  document.getElementById('clear-logs-btn').addEventListener('click', clearTodayLogs);
}

async function init() {
  syncThemeIcons();
  document.getElementById('current-date').textContent = getTodayKey();
  bindEvents();

  try {
    const res = await fetch('./data/foods.json');
    if (!res.ok) throw new Error('無法讀取外食資料');
    foodDatabase = await res.json();
  } catch (err) {
    console.error(err);
    showToast('讀取 data/foods.json 失敗，請確認透過伺服器執行', 'error');
  }

  renderCategoryTabs();
  renderFoodGrid();
  renderAll();
}

init();