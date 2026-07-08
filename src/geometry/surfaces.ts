import type { BuildingDimensions, RoofSettings, Surface } from "../domain/types";

export function resolveRoof(building: BuildingDimensions, roof: RoofSettings): RoofSettings {
  const span = roof.type === "gable" ? building.width / 2 : building.width;
  if (roof.type === "flat")
    return { ...roof, ridgeHeight: building.wallHeight, highSideHeight: building.wallHeight, slopeAngle: 0 };
  if (roof.inputMode === "angle") {
    const rise = Math.tan((roof.slopeAngle * Math.PI) / 180) * span;
    return roof.type === "gable"
      ? { ...roof, ridgeHeight: building.wallHeight + rise }
      : { ...roof, highSideHeight: building.wallHeight + rise };
  }
  const high = roof.type === "gable" ? roof.ridgeHeight : roof.highSideHeight;
  return { ...roof, slopeAngle: (Math.atan2(high - building.wallHeight, span) * 180) / Math.PI };
}

const rect = (width: number, height: number) => [
  { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
];

export function createBuildingSurfaces(building: BuildingDimensions, rawRoof: RoofSettings): Surface[] {
  const roof = resolveRoof(building, rawRoof);
  const { length, width, wallHeight } = building;
  const facadeAHeight = roof.type === "mono" && roof.slopeDirection === "right-to-left" ? roof.highSideHeight : wallHeight;
  const facadeCHeight = roof.type === "mono" && roof.slopeDirection === "left-to-right" ? roof.highSideHeight : wallHeight;
  const surfaces: Surface[] = [
    { id: "wall-a", name: "Фасад A", code: "A", type: "wall", polygon: rect(length, facadeAHeight), width: length, height: facadeAHeight },
    { id: "wall-c", name: "Фасад C", code: "C", type: "wall", polygon: rect(length, facadeCHeight), width: length, height: facadeCHeight },
  ];

  let end = rect(width, wallHeight);
  let endType: Surface["type"] = "wall";
  if (roof.type === "gable") {
    end = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: wallHeight }, { x: width / 2, y: roof.ridgeHeight }, { x: 0, y: wallHeight }];
    endType = "gable-wall";
  }
  if (roof.type === "mono") {
    const left = roof.slopeDirection === "left-to-right" ? wallHeight : roof.highSideHeight;
    const right = roof.slopeDirection === "left-to-right" ? roof.highSideHeight : wallHeight;
    end = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: right }, { x: 0, y: left }];
    endType = "gable-wall";
  }
  surfaces.push(
    { id: "wall-b", name: "Фасад B", code: "B", type: endType, polygon: end, width, height: Math.max(...end.map((point) => point.y)) },
    { id: "wall-d", name: "Фасад D", code: "D", type: endType, polygon: end.map((point) => ({ x: width - point.x, y: point.y })).reverse(), width, height: Math.max(...end.map((point) => point.y)) },
  );

  const roofWidth = length + 2 * roof.gableOverhang;
  if (roof.type === "flat")
    surfaces.push({ id: "roof-1", name: "Кровля", code: "R1", type: "roof", polygon: rect(roofWidth, width + 2 * roof.eaveOverhang), width: roofWidth, height: width + 2 * roof.eaveOverhang });
  if (roof.type === "mono") {
    const slope = Math.hypot(width, roof.highSideHeight - wallHeight) + 2 * roof.eaveOverhang;
    surfaces.push({ id: "roof-1", name: "Скат 1", code: "R1", type: "roof", polygon: rect(roofWidth, slope), width: roofWidth, height: slope });
  }
  if (roof.type === "gable") {
    const slope = Math.hypot(width / 2, roof.ridgeHeight - wallHeight) + roof.eaveOverhang;
    for (let index = 1; index <= 2; index++)
      surfaces.push({ id: `roof-${index}`, name: `Скат ${index}`, code: `R${index}`, type: "roof", polygon: rect(roofWidth, slope), width: roofWidth, height: slope });
  }
  return surfaces;
}
