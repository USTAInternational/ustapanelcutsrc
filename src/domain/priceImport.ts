import * as XLSX from "xlsx";
import type { CalculationSettings } from "./types";

const PRICE_FIELD_ALIASES: Record<string, keyof CalculationSettings> = {
  wallpriceperm2: "wallPricePerM2",
  roofpriceperm2: "roofPricePerM2",
  mountpanelpriceperm2: "mountPanelPricePerM2",
  mountflashingpriceperm: "mountFlashingPricePerM",
  transportrateperkm: "transportRatePerKm",
  craneshiftprice: "craneShiftPrice",
  scaffoldpriceperm2: "scaffoldPricePerM2",
  basepriceperm: "basePricePerM",
  ridgepriceperm: "ridgePricePerM",
  eavepriceperm: "eavePricePerM",
  gablepriceperm: "gablePricePerM",
  cornerpriceperm: "cornerPricePerM",
  fastenerprice: "fastenerPrice",
  "ценастен": "wallPricePerM2",
  "ценакровли": "roofPricePerM2",
  "монтажпанелей": "mountPanelPricePerM2",
  "монтажфасонных": "mountFlashingPricePerM",
  "транспорткм": "transportRatePerKm",
  "автокрансмена": "craneShiftPrice",
  "лесаподмости": "scaffoldPricePerM2",
  "цокольнаяпланка": "basePricePerM",
  "конек": "ridgePricePerM",
  "карниз": "eavePricePerM",
  "фронтон": "gablePricePerM",
  "уголнаружный": "cornerPricePerM",
  "саморез": "fastenerPrice",
};

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "");

export async function importPriceSheet(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(firstSheet, {
    header: 1,
    blankrows: false,
  });
  const patch: Partial<CalculationSettings> = {};
  for (const row of rows) {
    const [rawKey, rawValue] = row;
    const field = PRICE_FIELD_ALIASES[normalizeKey(rawKey)];
    const value = Number(rawValue);
    if (!field || !Number.isFinite(value)) continue;
    patch[field] = value as never;
  }
  return patch;
}
