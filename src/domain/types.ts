export type RoofType = "flat" | "mono" | "gable";
export type RoofInputMode = "height" | "angle";
export type WallLayoutDirection = "vertical" | "horizontal";
export type LayoutAlignment = "start" | "end" | "center" | "manual";
export type SurfaceType = "wall" | "gable-wall" | "roof";
export type PricingMode = "visible-area" | "blank-area" | "nominal-area";
export type InsulationType = "eps" | "basalt" | "pir";
export type PanelSeries = "wall-z-lock" | "wall-secret-fix" | "roof-tsp";
export interface Point2D {
  x: number;
  y: number;
}
export interface Point3D {
  x: number;
  y: number;
  z: number;
}
export interface SurfaceFrame {
  surfaceId: string;
  /** Origin and orthonormal axes in the project coordinate system, millimetres. */
  origin: Point3D;
  uAxis: Point3D;
  vAxis: Point3D;
  normal: Point3D;
}
export type JointKind =
  | "external-corner"
  | "base"
  | "eave"
  | "gable"
  | "ridge"
  | "parapet"
  | "longitudinal-seam"
  | "transverse-seam"
  | "opening"
  | "roof-wall";
export interface JointRuleReference {
  catalogVersion: string;
  ruleId: string;
  sourceDocument: string;
  sourceRevision: string;
  verified: boolean;
}
export interface ConstructionVoid {
  id: string;
  jointId: string;
  kind: "corner-cavity" | "mounting-gap" | "opening-clearance";
  path: Point3D[];
  widthMm: number;
  depthMm: number;
}
export interface JointInstance {
  id: string;
  kind: JointKind;
  surfaceIds: string[];
  panelIds: string[];
  path: Point3D[];
  clearanceMm: number;
  voidIds: string[];
  flashingIds: string[];
  rule: JointRuleReference;
}
export interface FlashingProfile {
  code: string;
  name: string;
  legWidthsMm: number[];
  /** Visible cover width in a facade/roof projection. */
  visibleWidthMm: number;
  thicknessMm: number;
}
export interface FlashingInstance {
  id: string;
  mark: string;
  kind: JointKind;
  surfaceId?: string;
  jointId: string;
  path: Point3D[];
  /** Installed path length, excluding stock reserve. */
  lengthMm: number;
  blankLengthMm: number;
  overlapMm: number;
  quantity: number;
  profile: FlashingProfile;
  rule: JointRuleReference;
}
export interface AssemblyPanel {
  id: string;
  panelId: string;
  surfaceId: string;
  frameId: string;
  blankPolygon: Point2D[];
  installationPolygon: Point2D[];
  /** Exposed contour after covering strips are applied. */
  exposedPolygon: Point2D[];
  cutouts: PanelCutout[];
  thicknessMm: number;
  innerOffsetMm: number;
  voidIds: string[];
  jointIds: string[];
  supportSpan?: {
    startMm: number;
    endMm: number;
    axisLengthMm: number;
    visibleLengthMm: number;
    fabricationLengthMm: number;
    startCoverMm: number;
    endCoverMm: number;
    startExtensionMm: number;
    endExtensionMm: number;
  };
}
export type ConstructionMemberKind =
  | "column"
  | "truss-chord"
  | "truss-web"
  | "purlin"
  | "opening-frame";
export interface ConstructionMember {
  id: string;
  kind: ConstructionMemberKind;
  start: Point3D;
  end: Point3D;
  section: string;
  envelopeWidthMm: number;
  envelopeDepthMm: number;
}
export interface FoundationSolid {
  id: string;
  kind: "strip" | "pad";
  center: Point3D;
  size: Point3D;
  topElevationMm: number;
  bottomElevationMm: number;
}
export interface BasePlateInstance {
  id: string;
  columnId: string;
  center: Point3D;
  size: Point3D;
}
export interface CoordinationIssue {
  id: string;
  severity: "warning" | "error";
  code:
    | "unverified-joint-rule"
    | "column-foundation-intersection"
    | "panel-frame-intersection"
    | "missing-joint"
    | "negative-clearance"
    | "opening-outside-surface"
    | "missing-support"
    | "narrow-cut"
    | "nonstandard-clearance"
    | "long-flashing"
    | "installation-risk";
  message: string;
  objectIds: string[];
  surfaceId?: string;
}
export interface ConstructionModel {
  schemaVersion: 1;
  units: "mm";
  coordinateSystem: {
    x: "building-length";
    y: "elevation";
    z: "building-width";
    zero: "foundation-top";
  };
  levels: {
    foundationTopMm: 0;
    foundationBottomMm: number;
    basePlateTopMm: number;
    wallTopMm: number;
    ridgeTopMm: number;
  };
  surfaceFrames: SurfaceFrame[];
  panels: AssemblyPanel[];
  joints: JointInstance[];
  flashings: FlashingInstance[];
  voids: ConstructionVoid[];
  members: ConstructionMember[];
  foundations: FoundationSolid[];
  basePlates: BasePlateInstance[];
  documentationBlocked: boolean;
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
  series: PanelSeries;
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
  quickMode: boolean;
  subtractOpenings: boolean;
  showWaste: boolean;
  groupPanels: boolean;
  groupMirrored: boolean;
  rounding: number;
  mountingGapMm: number;
  thermalGapMm: number;
  openingClearanceMm: number;
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
  craneShifts: number;
  craneShiftPrice: number;
  scaffoldPricePerM2: number;
  weatherRiskPercent: number;
}
export type ColumnType = "i-beam" | "tube" | "double-channel";
export type FoundationType = "strip" | "pad";
export interface StructuralSettings {
  /** Регион объекта — определяет снег, ветер, грунты и транспортное плечо */
  regionId: string;
  /** Шаг колонн / ферм вдоль здания, мм */
  columnStep: number;
  /** Тип грунта: "auto" — по региону, иначе id из SOIL_TYPES */
  soilId: string;
  /** Глубина заложения фундамента, мм */
  foundationDepth: number;
  /** Монтажный вынос наружной плоскости панели от оси каркаса, мм */
  panelOffsetMm: number;
  /** Вентиляционный зазор/подсистема за облицовкой, мм */
  facadeVentGapMm: number;
  /** Профиль прогона: "auto" — подбор, иначе имя из сортамента
   *  (ручной выбор = режим «по существующему каркасу» из листа 1) */
  purlinProfile: string;
  /** Тип сечения колонны (лист 1: двутавр / проф. труба / 2 швеллера) */
  columnType: ColumnType;
  /** Сечение колонны: "auto" — подбор, иначе имя из каталога типа */
  columnSection: string;
  /** Тип фундамента: ленточный или столбчатый под колонны */
  foundationType: FoundationType;
  foundationConcreteClass: string;
  foundationRebarClass: "A400" | "A500C";
  foundationMainRebarDiameterMm: number;
  foundationStirrupDiameterMm: number;
  foundationRebarStepMm: number;
  foundationCoverMm: number;
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
  wallJoints: number;
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
  flashingRalColor: string;
  openings: Opening[];
  calculationSettings: CalculationSettings;
  commercial: CommercialInfo;
  structural: StructuralSettings;
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
  structural: import("../calculation/structural").StructuralResult;
  /** Single source of coordinated 2D/3D geometry. */
  assembly: ConstructionModel;
  joints: JointInstance[];
  flashings: FlashingInstance[];
  coordinationIssues: CoordinationIssue[];
}
export interface SavedProject extends ProjectInput {
  formatVersion: 1 | 2;
}
