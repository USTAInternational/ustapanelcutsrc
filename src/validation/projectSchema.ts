import { z } from "zod";
import { RAL_COLORS } from "../domain/ral";
import {
  defaultCommercial,
  defaultStructural,
} from "../domain/defaultProject";
import { KG_REGIONS } from "../domain/regions";
const finitePositive = z.number().finite().positive(),
  nonnegative = z.number().finite().nonnegative();
const commercialSchema = z
  .object({
    objectName: z.string().default(""),
    objectAddress: z.string().default(""),
    customer: z.string().default(""),
    contact: z.string().default(""),
    managerName: z.string().default(""),
    managerPhone: z.string().default(""),
    factoryName: z.string().default(""),
    factoryAddress: z.string().default(""),
  })
  .default(defaultCommercial);
const structuralSchema = z
  .object({
    regionId: z
      .string()
      .refine((id) => KG_REGIONS.some((r) => r.id === id), "Неизвестный регион")
      .default(defaultStructural.regionId),
    columnStep: finitePositive.default(defaultStructural.columnStep),
    soilId: z.string().default("auto"),
    foundationDepth: finitePositive.default(defaultStructural.foundationDepth),
    panelOffsetMm: nonnegative.default(defaultStructural.panelOffsetMm),
    facadeVentGapMm: nonnegative.default(defaultStructural.facadeVentGapMm),
    wallGirtStep: finitePositive.default(defaultStructural.wallGirtStep),
    purlinProfile: z.string().default("auto"),
    columnType: z
      .enum(["i-beam", "tube", "double-channel"])
      .default("i-beam"),
    columnSection: z.string().default("auto"),
    foundationType: z.enum(["strip", "pad"]).default("strip"),
  })
  .default(defaultStructural);
const panel = z
  .object({
    series: z.enum(["wall-z-lock", "wall-secret-fix", "roof-tsp"]),
    thickness: finitePositive,
    ralColor: z.string().refine(
      (code) => RAL_COLORS.some((color) => color.code === code),
      "Выберите цвет из палитры RAL",
    ),
    insulation: z.enum(["eps", "basalt", "pir"]),
    effectiveWidth: finitePositive,
    nominalWidth: finitePositive,
    maxLength: finitePositive,
    overlapLength: nonnegative.optional(),
    layoutDirection: z.enum(["vertical", "horizontal"]),
    alignment: z.enum(["start", "end", "center", "manual"]),
    manualOffset: z.number().finite(),
    minimumEdgeWidth: nonnegative,
  })
  .refine((v) => v.nominalWidth >= v.effectiveWidth, {
    message: "Номинальная ширина должна быть не меньше рабочей",
    path: ["nominalWidth"],
  });
export const projectSchema = z
  .object({
    building: z.object({
      length: finitePositive,
      width: finitePositive,
      wallHeight: finitePositive,
    }),
    roof: z.object({
      type: z.enum(["flat", "mono", "gable"]),
      inputMode: z.enum(["height", "angle"]),
      ridgeHeight: finitePositive,
      highSideHeight: finitePositive,
      slopeAngle: z.number().finite().min(0).max(89),
      slopeDirection: z.enum(["left-to-right", "right-to-left"]),
      eaveOverhang: nonnegative,
      gableOverhang: nonnegative,
    }),
    wallPanelSystem: panel.refine(
      (v) => v.maxLength >= 2000 && v.maxLength <= 12000,
      {
        message: "Максимальная длина стеновой панели должна быть от 2 до 12 м",
        path: ["maxLength"],
      },
    ),
    roofPanelSystem: panel,
    openings: z.array(
      z.object({
        id: z.string(),
        surfaceId: z.string(),
        type: z.enum(["window", "door", "gate"]),
        name: z.string().min(1),
        x: nonnegative,
        y: nonnegative,
        width: finitePositive,
        height: finitePositive,
      }),
    ),
    calculationSettings: z.object({
      reservePercent: nonnegative,
      pricingMode: z.enum(["visible-area", "blank-area", "nominal-area"]),
      quickMode: z.boolean().default(false),
      subtractOpenings: z.boolean(),
      showWaste: z.boolean(),
      groupPanels: z.boolean(),
      groupMirrored: z.boolean(),
      rounding: finitePositive,
      mountingGapMm: nonnegative.default(0),
      thermalGapMm: nonnegative.default(0),
      openingClearanceMm: nonnegative.default(0),
      wallPricePerM2: nonnegative,
      roofPricePerM2: nonnegative,
      ridgePricePerM: nonnegative,
      cornerPricePerM: nonnegative,
      basePricePerM: nonnegative,
      eavePricePerM: nonnegative,
      gablePricePerM: nonnegative,
      fastenerPrice: nonnegative,
      fastenersPerM2: nonnegative,
      flashingReservePercent: nonnegative,
      flashingOverlap: nonnegative,
      mountPanelPricePerM2: nonnegative.default(0),
      mountFlashingPricePerM: nonnegative.default(0),
      productivityPerDay: finitePositive.default(80),
      transportDistanceKm: nonnegative.default(0),
      transportRatePerKm: nonnegative.default(0),
      craneShifts: nonnegative.default(0),
      craneShiftPrice: nonnegative.default(0),
      scaffoldPricePerM2: nonnegative.default(0),
      weatherRiskPercent: nonnegative.default(0),
    }),
    commercial: commercialSchema,
    structural: structuralSchema,
  })
  .superRefine((v, c) => {
    if (
      v.roof.type === "gable" &&
      v.roof.inputMode === "height" &&
      v.roof.ridgeHeight <= v.building.wallHeight
    )
      c.addIssue({
        code: "custom",
        message: "Конек должен быть выше стены",
        path: ["roof", "ridgeHeight"],
      });
    if (
      v.roof.type === "mono" &&
      v.roof.inputMode === "height" &&
      v.roof.highSideHeight <= v.building.wallHeight
    )
      c.addIssue({
        code: "custom",
        message: "Высокая сторона должна быть выше стены",
        path: ["roof", "highSideHeight"],
      });
  });
