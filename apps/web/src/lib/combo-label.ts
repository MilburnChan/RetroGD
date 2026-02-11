const comboLabelMap: Record<string, string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  triple_with_pair: "三带二",
  straight: "顺子",
  straight_flush: "同花顺",
  consecutive_pairs: "连对",
  steel: "钢板",
  bomb: "炸弹",
  joker_bomb: "王炸",
  invalid: "无效"
};

export const comboLabel = (type: string | null | undefined): string => {
  if (!type) return "待识别";
  return comboLabelMap[type] ?? type;
};
