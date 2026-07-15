import { describe, expect, it } from "vitest";
import { defaultProject } from "../domain/defaultProject";
import { projectSchema } from "../validation/projectSchema";
describe("валидация проекта", () => {
  it("принимает проект по умолчанию", () =>
    expect(projectSchema.safeParse(defaultProject).success).toBe(true));
  it("отклоняет отрицательный размер", () =>
    expect(
      projectSchema.safeParse({
        ...defaultProject,
        building: { ...defaultProject.building, length: -1 },
      }).success,
    ).toBe(false));
  it("отклоняет низкий конек", () =>
    expect(
      projectSchema.safeParse({
        ...defaultProject,
        roof: { ...defaultProject.roof, ridgeHeight: 3000 },
      }).success,
    ).toBe(false));
  it("отклоняет нулевую толщину панели", () =>
    expect(
      projectSchema.safeParse({
        ...defaultProject,
        wallPanelSystem: { ...defaultProject.wallPanelSystem, thickness: 0 },
      }).success,
    ).toBe(false));
  it("отклоняет неизвестный код RAL", () =>
    expect(
      projectSchema.safeParse({
        ...defaultProject,
        roofPanelSystem: {
          ...defaultProject.roofPanelSystem,
          ralColor: "RAL 0000",
        },
      }).success,
    ).toBe(false));
  it("отклоняет неизвестный RAL фасонных элементов", () =>
    expect(
      projectSchema.safeParse({
        ...defaultProject,
        flashingRalColor: "RAL 0000",
      }).success,
    ).toBe(false));
  it("принимает все поддерживаемые утеплители", () => {
    for (const insulation of ["eps", "basalt", "pir"] as const) {
      expect(
        projectSchema.safeParse({
          ...defaultProject,
          wallPanelSystem: {
            ...defaultProject.wallPanelSystem,
            insulation,
          },
        }).success,
      ).toBe(true);
    }
  });
});
it("ограничивает длину стеновой панели диапазоном 2–12 м", () => {
  expect(
    projectSchema.safeParse({
      ...defaultProject,
      wallPanelSystem: { ...defaultProject.wallPanelSystem, maxLength: 1999 },
    }).success,
  ).toBe(false);
  expect(
    projectSchema.safeParse({
      ...defaultProject,
      wallPanelSystem: { ...defaultProject.wallPanelSystem, maxLength: 12001 },
    }).success,
  ).toBe(false);
});
