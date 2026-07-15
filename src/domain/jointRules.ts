import type {
  FlashingProfile,
  JointKind,
  JointRuleReference,
  PanelSeries,
} from "./types";

export const JOINT_CATALOG_VERSION = "usta-coordination-2026.1-draft";

export interface JointRule {
  id: string;
  series: PanelSeries;
  kind: JointKind;
  clearanceMm: number;
  panelCutbackMm: number;
  panelExtensionMm: number;
  overlapMm: number;
  maximumStockLengthMm: number;
  requiresSupport: boolean;
  fill: "none" | "mineral-wool" | "foam" | "sealant";
  flashing: FlashingProfile;
  reference: JointRuleReference;
}

const sourceBySeries: Record<PanelSeries, string> = {
  "wall-z-lock": "Технический каталог стеновых панелей Z-Lock",
  "wall-secret-fix": "Технический каталог стеновых панелей Secret Fix",
  "roof-tsp": "Технический каталог кровельных панелей ТСП-К",
};

const flashingByKind: Record<JointKind, FlashingProfile> = {
  "external-corner": { code: "FE-UC", name: "Угол наружный", legWidthsMm: [150, 150], visibleWidthMm: 150, thicknessMm: 0.7 },
  base: { code: "FE-C", name: "Цокольная планка", legWidthsMm: [100, 80], visibleWidthMm: 100, thicknessMm: 0.7 },
  eave: { code: "FE-K", name: "Карнизная планка", legWidthsMm: [150, 100], visibleWidthMm: 150, thicknessMm: 0.7 },
  gable: { code: "FE-F", name: "Фронтонная планка", legWidthsMm: [150, 100], visibleWidthMm: 150, thicknessMm: 0.7 },
  ridge: { code: "FE-KN", name: "Коньковая планка", legWidthsMm: [250, 250], visibleWidthMm: 500, thicknessMm: 0.7 },
  parapet: { code: "FE-P", name: "Парапетная планка", legWidthsMm: [200, 150], visibleWidthMm: 200, thicknessMm: 0.7 },
  "longitudinal-seam": { code: "FE-PS", name: "Продольный стык", legWidthsMm: [60, 60], visibleWidthMm: 120, thicknessMm: 0.7 },
  "transverse-seam": { code: "FE-TS", name: "Межколонный нащельник", legWidthsMm: [60, 60], visibleWidthMm: 120, thicknessMm: 0.7 },
  opening: { code: "FE-PR", name: "Обрамление проёма", legWidthsMm: [100, 80], visibleWidthMm: 100, thicknessMm: 0.7 },
  "roof-wall": { code: "FE-PK", name: "Примыкание кровли к стене", legWidthsMm: [150, 150], visibleWidthMm: 150, thicknessMm: 0.7 },
};

const defaultForKind = (kind: JointKind) => ({
  clearanceMm: kind === "opening" ? 10 : 0,
  panelCutbackMm: 0,
  panelExtensionMm: kind === "external-corner" ? 30 : 0,
  overlapMm: kind === "ridge" || kind === "eave" || kind === "gable" ? 150 : 100,
  maximumStockLengthMm: 3000,
  requiresSupport: !["ridge", "external-corner"].includes(kind),
  fill: kind === "opening" ? ("sealant" as const) : ("none" as const),
});

const kinds: JointKind[] = [
  "external-corner",
  "base",
  "eave",
  "gable",
  "ridge",
  "parapet",
  "longitudinal-seam",
  "transverse-seam",
  "opening",
  "roof-wall",
];

const series: PanelSeries[] = ["wall-z-lock", "wall-secret-fix", "roof-tsp"];

/**
 * Coordination defaults are deliberately unverified. They make the model
 * inspectable but keep working-document export blocked until a manufacturer
 * drawing and revision are attached to the rule.
 */
export const JOINT_RULES: JointRule[] = series.flatMap((panelSeries) =>
  kinds.map((kind) => ({
    id: `${panelSeries}:${kind}`,
    series: panelSeries,
    kind,
    ...defaultForKind(kind),
    flashing: flashingByKind[kind],
    reference: {
      catalogVersion: JOINT_CATALOG_VERSION,
      ruleId: `${panelSeries}:${kind}`,
      sourceDocument: sourceBySeries[panelSeries],
      sourceRevision: "требует подтверждения",
      verified: false,
    },
  })),
);

export function jointRule(seriesId: PanelSeries, kind: JointKind): JointRule {
  const rule = JOINT_RULES.find((item) => item.series === seriesId && item.kind === kind);
  if (!rule) throw new Error(`Не найдено правило узла ${seriesId}:${kind}`);
  return rule;
}
