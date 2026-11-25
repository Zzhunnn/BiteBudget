/**
 * 規則式剩餘額度推薦引擎（Fallback 機制）
 * 根據剩餘預算、蛋白質缺口與熱量額度，從內建外食庫篩選高 CP 值單品或雙品組合
 */
export function getRuleRecommendations(foods, { remainingBudget, proteinGap, caloriesGap }) {
  if (!Array.isArray(foods) || foods.length === 0) {
    return { status: 'empty', message: '外食資料庫尚未載入。', items: [] };
  }

  if (remainingBudget <= 0) {
    return {
      status: 'over_budget',
      message: '今日餐費預算已用完，建議優先喝水或回家自備餐點，明天再重新挑戰！',
      items: [],
    };
  }

  // 篩出單品價格在預算內的項目
  const affordable = foods.filter((f) => f.price <= remainingBudget);
  if (affordable.length === 0) {
    return {
      status: 'low_budget',
      message: `目前剩餘 $${remainingBudget}，低於清單內最低價餐點，建議先保留預算。`,
      items: [],
    };
  }

  const candidates = [];

  // 1. 單品候選
  for (const item of affordable) {
    candidates.push({
      foods: [item],
      title: item.name,
      totalPrice: item.price,
      totalCalories: item.calories,
      totalProtein: item.protein,
    });
  }

  // 2. 兩樣搭配候選（允許不同品項互搭，例如：無糖豆漿 + 茶葉蛋）
  for (let i = 0; i < affordable.length; i++) {
    for (let j = i + 1; j < affordable.length; j++) {
      const a = affordable[i];
      const b = affordable[j];
      const totalPrice = a.price + b.price;
      if (totalPrice <= remainingBudget) {
        candidates.push({
          foods: [a, b],
          title: `${a.name} ＋ ${b.name}`,
          totalPrice,
          totalCalories: a.calories + b.calories,
          totalProtein: a.protein + b.protein,
        });
      }
    }
  }

  // 評分函式
  const scored = candidates.map((c) => {
    let score = 0;
    const proteinPerDollar = c.totalProtein / Math.max(c.totalPrice, 1);

    if (proteinGap > 0) {
      // 有蛋白質缺口：重視補齊比例 + 蛋白質 CP 值
      const coverage = Math.min(c.totalProtein / proteinGap, 1.15);
      score += coverage * 60;
      score += proteinPerDollar * 45;
    } else {
      // 蛋白質已達標：重視輕負擔、不爆卡、省錢
      score += (1 - c.totalPrice / Math.max(remainingBudget, 1)) * 40;
      score += c.totalCalories <= 300 ? 35 : 10;
    }

    // 熱量控制：若超過剩餘熱量額度則扣分
    if (caloriesGap > 0 && c.totalCalories > caloriesGap) {
      const excessRatio = (c.totalCalories - caloriesGap) / Math.max(caloriesGap, 1);
      score -= excessRatio * 50;
    } else if (caloriesGap <= 0) {
      // 熱量已超標，大幅偏向低卡食物
      score -= c.totalCalories * 0.15;
    }

    // 生成簡短推薦理由
    let reason = '';
    if (proteinGap > 0) {
      const pct = Math.min(Math.round((c.totalProtein / proteinGap) * 100), 100);
      reason = `補齊約 ${pct}% 蛋白質缺口，每 10 元可換 ${(proteinPerDollar * 10).toFixed(1)}g 蛋白`;
    } else {
      reason = `蛋白質已達標，這款輕量搭配花費 $${c.totalPrice}、熱量負擔較低`;
    }

    return { ...c, score, reason };
  });

  // 排序並去重（避免前 3 名都重複出現同一道主食）
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const usedFirstId = new Set();
  for (const cand of scored) {
    if (picked.length >= 3) break;
    const primaryKey = cand.foods.map((f) => f.id).join('+');
    if (!usedFirstId.has(primaryKey)) {
      picked.push(cand);
      usedFirstId.add(primaryKey);
    }
  }

  return {
    status: 'ok',
    message:
      proteinGap > 0
        ? `目前剩餘 $${remainingBudget}、尚缺 ${proteinGap}g 蛋白質，為你篩選出高 CP 值搭配：`
        : `目前剩餘 $${remainingBudget}、蛋白質已達標！以下為輕負擔建議：`,
    items: picked,
  };
}