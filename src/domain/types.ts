export type RoofType = "flat" | "mono" | "gable";
export type RoofInputMode = "height" | "angle";
export type WallLayoutDirection = "vertical" | "horizontal";
export type LayoutAlignment = "start" | "end" | "center" | "manual";
export type SurfaceType = "wall" | "gable-wall" | "roof";
export type PricingMode = "visible-area" | "blank-area" | "nominal-area";
export type InsulationType = "eps" | "basalt" | "pir";
export interface Point2D {
  x: number;
  y: number;
}
export interface BuildingDimensions {
  length: number;
  width: number;
  wallHeight: number;
}
export interface RoofSettings {
  type: RoofType;
  inputMode: RoofInputMode;
  ridgeHeight: number;
  highSideHeight: number;
  slopeAngle: number;
  slopeDirection: "left-to-right" | "right-to-left";
  eaveOverhang: number;
  gableOverhang: number;
}
export interface PanelSystem {
  thickness: number;
  ralColor: string;
  insulation: InsulationType;
  effectiveWidth: number;
  nominalWidth: number;
  maxLength: number;
  overlapLength?: number;
  layoutDirection: WallLayoutDirection;
  alignment: LayoutAlignment;
  manualOffset: number;
  minimumEdgeWidth: number;
}
export interface Surface {
  id: string;
  name: string;
  code: string;
  type: SurfaceType;
  polygon: Point2D[];
  width: number;
  height: number;
}
export interface Opening {
  id: string;
  surfaceId: string;
  type: "window" | "door" | "gate";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PanelCutout {
  openingId: string;
  polygon: Point2D[];
  localX: number;
  localY: number;
  width: number;
  height: number;
}
export interface PanelPiece {
  id: string;
  mark: string;
  surfaceId: string;
  polygon: Point2D[];
  sourceStripPolygon: Point2D[];
  positionX: number;
  positionY: number;
  nominalWidth: number;
  actualWidth: number;
  leftLength: number;
  rightLength: number;
  minimumLength: number;
  maximumLength: number;
  visibleArea: number;
  blankArea: number;
  wasteArea: number;
  topCutAngle?: number;
  bottomCutAngle?: number;
  cutouts: PanelCutout[];
  mirrored: boolean;
  lengthExceeded: boolean;
}
export interface GroupedPanel {
  groupId: string;
  mark: string;
  surfaceId: string;
  panelIds: string[];
  quantity: number;
  width: number;
  leftLength: number;
  rightLength: number;
  maximumLength: number;
  topCutAngle?: number;
  mirrored: boolean;
  visibleArea: number;
  blankArea: number;
  wasteArea: number;
}
export interface CalculationSettings {
  reservePercent: number;
  pricingMode: PricingMode;
  subtractOpenings: boolean;
  showWaste: boolean;
  groupPanels: boolean;
  groupMirrored: boolean;
  rounding: number;
  wallPricePerM2: number;
  roofPricePerM2: number;
  ridgePricePerM: number;
  cornerPricePerM: number;
  basePricePerM: number;
  eavePricePerM: number;
  gablePricePerM: number;
  fastenerPrice: number;
  fastenersPerM2: number;
  flashingReservePercent: number;
  flashingOverlap: number;
  mountPanelPricePerM2: number;
  mountFlashingPricePerM: number;
  productivityPerDay: number;
  transportDistanceKm: number;
  transportRatePerKm: number;
}
export interface CommercialInfo {
  objectName: string;
  objectAddress: string;
  customer: string;
  contact: string;
  managerName: string;
  managerPhone: string;
  factoryName: string;
  factoryAddress: string;
}
export interface EstimateLine {
  section: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  sum: number;
}
export interface EstimateBreakdown {
  materials: EstimateLine[];
  works: EstimateLine[];
  transport: EstimateLine[];
  materialsSum: number;
  worksSum: number;
  transportSum: number;
  total: number;
  mountDays: number;
}
export interface CalculationWarning {
  id: string;
  severity: "warning" | "error";
  surfaceId?: string;
  panelId?: string;
  message: string;
}
export interface FlashingSummary {
  base: number;
  externalCorners: number;
  ridge: number;
  eave: number;
  gable: number;
  openings: number;
}
export interface ProjectInput {
  building: BuildingDimensions;
  roof: RoofSettings;
  wallPanelSystem: PanelSystem;
  roofPanelSystem: PanelSystem;
  openings: Opening[];
  calculationSettings: CalculationSettings;
  commercial: CommercialInfo;
}
export interface ProjectSummary {
  wallArea: number;
  roofArea: number;
  openingArea: number;
  visibleArea: number;
  blankArea: number;
  wasteArea: number;
  wastePercent: number;
  reserveArea: number;
  wallPanelCount: number;
  roofPanelCount: number;
  uniqueCount: number;
  estimatedCost: number;
  fastenerCount: number;
  flashings: FlashingSummary;
  estimate: EstimateBreakdown;
}
export interface ProjectCalculation {
  surfaces: Surface[];
  panels: PanelPiece[];
  groups: GroupedPanel[];
  warnings: CalculationWarning[];
  summary: ProjectSummary;
}
export interface SavedProject extends ProjectInput {
  formatVersion: 1;
}
