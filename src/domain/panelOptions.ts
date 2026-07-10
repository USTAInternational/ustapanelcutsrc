import type { InsulationType, PanelSeries, PanelSystem } from "./types";

export const INSULATION_OPTIONS: Array<{
  value: InsulationType;
  label: string;
}> = [
  { value: "eps", label: "ППС" },
  { value: "basalt", label: "Базальтовая вата" },
  { value: "pir", label: "ПИР" },
];

export const insulationLabel = (value: InsulationType) =>
  INSULATION_OPTIONS.find((option) => option.value === value)?.label ?? value;

export const PANEL_SERIES_OPTIONS: Array<{
  value: PanelSeries;
  label: string;
  note: string;
}> = [
  {
    value: "wall-z-lock",
    label: "Стеновая Z-Lock",
    note: "Горизонтальная раскладка, рабочая ширина 1000 мм",
  },
  {
    value: "wall-secret-fix",
    label: "Стеновая Secret Fix",
    note: "Скрытое крепление, рабочая ширина 1000 мм",
  },
  {
    value: "roof-tsp",
    label: "Кровельная ТСП-К",
    note: "Вертикальная раскладка по скату, рабочая ширина 1000 мм",
  },
];

export function panelSeriesDefaults(series: PanelSeries): Partial<PanelSystem> {
  if (series === "wall-secret-fix")
    return {
      series,
      effectiveWidth: 1000,
      nominalWidth: 1049,
      layoutDirection: "horizontal",
      maxLength: 12000,
      minimumEdgeWidth: 300,
      alignment: "center",
    };
  if (series === "roof-tsp")
    return {
      series,
      effectiveWidth: 1000,
      nominalWidth: 1081,
      layoutDirection: "vertical",
      maxLength: 12000,
      minimumEdgeWidth: 300,
      alignment: "center",
      overlapLength: 200,
    };
  return {
    series: "wall-z-lock",
    effectiveWidth: 1000,
    nominalWidth: 1021,
    layoutDirection: "horizontal",
    maxLength: 12000,
    minimumEdgeWidth: 300,
    alignment: "center",
  };
}

export const panelSeriesLabel = (series: PanelSeries) =>
  PANEL_SERIES_OPTIONS.find((option) => option.value === series)?.label ?? series;
