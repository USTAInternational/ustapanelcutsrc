import type { InsulationType } from "./types";

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
