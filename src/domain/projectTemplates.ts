import type { Opening, ProjectInput } from "./types";

type TemplateData = {
  building?: Partial<ProjectInput["building"]>;
  roof?: Partial<ProjectInput["roof"]>;
  commercial?: Partial<ProjectInput["commercial"]>;
  openings?: Opening[];
};

export const PROJECT_TEMPLATES: Array<{
  id: string;
  label: string;
  data: TemplateData;
}> = [
  {
    id: "garage-6x12",
    label: "Гараж 6×12 м",
    data: {
      building: { length: 12000, width: 6000, wallHeight: 3200 },
      roof: { type: "gable", inputMode: "height", ridgeHeight: 4500 },
      openings: [
        {
          id: "tpl-gate",
          surfaceId: "wall-a",
          type: "gate",
          name: "Ворота",
          x: 1500,
          y: 0,
          width: 3000,
          height: 2800,
        },
      ],
      commercial: { objectName: "Типовой гараж 6×12" },
    },
  },
  {
    id: "hangar-18x36",
    label: "Ангар 18×36 м",
    data: {
      building: { length: 36000, width: 18000, wallHeight: 6000 },
      roof: { type: "gable", inputMode: "height", ridgeHeight: 9000 },
      commercial: { objectName: "Типовой ангар 18×36" },
    },
  },
  {
    id: "warehouse-12x24",
    label: "Склад 12×24 м",
    data: {
      building: { length: 24000, width: 12000, wallHeight: 5000 },
      roof: { type: "mono", inputMode: "height", highSideHeight: 6500 },
      commercial: { objectName: "Типовой склад 12×24" },
    },
  },
];
