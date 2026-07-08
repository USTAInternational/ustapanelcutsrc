import { useMemo, useState } from "react";
import { insulationLabel } from "../domain/panelOptions";
import type { GroupedPanel, InsulationType, PanelPiece } from "../domain/types";
import { useProjectStore } from "../store/projectStore";

const mm = (value: number) => Math.round(value).toLocaleString("ru-RU");
const kg = (value: number) => Math.round(value).toLocaleString("ru-RU");
const densityByInsulation: Record<InsulationType, number> = {
  eps: 15,
  basalt: 110,
  pir: 35,
};
const steelSkinsKgPerM2 = 7.85;

const panelUnitMassKg = (
  areaMm2: number,
  thicknessMm: number,
  insulation: InsulationType,
) => {
  const insulationKgPerM2 = densityByInsulation[insulation] * (thicknessMm / 1000);
  return (areaMm2 / 1e6) * (steelSkinsKgPerM2 + insulationKgPerM2);
};

interface SpecRow {
  key: string;
  mark: string;
  surfaceId: string;
  panelIds: string[];
  quantity: number;
  width: number;
  maximumLength: number;
  blankArea: number;
}

const isPanelPiece = (row: PanelPiece | GroupedPanel | SpecRow): row is PanelPiece =>
  "id" in row;

export function Specification() {
  const calculation = useProjectStore((state) => state.calculation);
  const selectPanel = useProjectStore((state) => state.selectPanel);
  const selectedPanelId = useProjectStore((state) => state.selectedPanelId);
  const wallPanelSystem = useProjectStore((state) => state.wallPanelSystem);
  const roofPanelSystem = useProjectStore((state) => state.roofPanelSystem);
  const wallRal = useProjectStore((state) => state.wallPanelSystem.ralColor);
  const roofRal = useProjectStore((state) => state.roofPanelSystem.ralColor);
  const wallInsulation = useProjectStore(
    (state) => state.wallPanelSystem.insulation,
  );
  const roofInsulation = useProjectStore(
    (state) => state.roofPanelSystem.insulation,
  );
  const [grouped, setGrouped] = useState(true);
  const [search, setSearch] = useState("");
  const [surfaceId, setSurfaceId] = useState("all");
  const surfaceById = useMemo(
    () => new Map(calculation.surfaces.map((surface) => [surface.id, surface])),
    [calculation.surfaces],
  );

  const surfaceIdsForGroup = (panelIds: string[]) =>
    new Set(
      panelIds
        .map((id) => calculation.panels.find((panel) => panel.id === id)?.surfaceId)
        .filter((id): id is string => Boolean(id)),
    );

  const rows = useMemo<Array<PanelPiece | GroupedPanel>>(() => {
    const query = search.toLowerCase();
    if (!grouped) {
      return calculation.panels.filter(
        (panel) =>
          (surfaceId === "all" || panel.surfaceId === surfaceId) &&
          panel.mark.toLowerCase().includes(query),
      );
    }
    return calculation.groups.filter(
      (group) =>
        (surfaceId === "all" || surfaceIdsForGroup(group.panelIds).has(surfaceId)) &&
        group.mark.toLowerCase().includes(query),
    );
  }, [calculation, grouped, search, surfaceId]);

  const surfaceNames = (panelIds: string[]) =>
    [...surfaceIdsForGroup(panelIds)]
      .map((id) => calculation.surfaces.find((surface) => surface.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  const systemForSurface = (id: string) =>
    surfaceById.get(id)?.type === "roof" ? roofPanelSystem : wallPanelSystem;
  const ralForSurface = (id: string) =>
    surfaceById.get(id)?.type === "roof" ? roofRal : wallRal;
  const insulationForSurface = (id: string) =>
    surfaceById.get(id)?.type === "roof" ? roofInsulation : wallInsulation;
  const designationForSurface = (id: string) =>
    surfaceById.get(id)?.type === "roof" ? "ГОСТ 23486-79" : "ГОСТ 32603-2012";
  const panelName = (row: PanelPiece | SpecRow) =>
    `${ralForSurface(row.surfaceId)} ${row.mark} (${mm(row.maximumLength)} x ${mm(isPanelPiece(row) ? row.actualWidth : row.width)})`;
  const quantity = (row: PanelPiece | GroupedPanel | SpecRow) => (isPanelPiece(row) ? 1 : row.quantity);
  const unitMass = (row: PanelPiece | GroupedPanel | SpecRow) => {
    const system = systemForSurface(row.surfaceId);
    return panelUnitMassKg(row.blankArea / quantity(row), system.thickness, system.insulation);
  };
  const specRows = useMemo<Array<PanelPiece | SpecRow>>(() => {
    if (!grouped) return rows as PanelPiece[];
    const merged = new Map<string, SpecRow>();
    for (const row of rows as GroupedPanel[]) {
      const key = [
        row.mark,
        designationForSurface(row.surfaceId),
        ralForSurface(row.surfaceId),
        insulationForSurface(row.surfaceId),
      ].join("|");
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += row.quantity;
        existing.blankArea += row.blankArea;
        existing.panelIds.push(...row.panelIds);
        existing.mark =
          existing.mark.localeCompare(row.mark, "ru", { numeric: true }) <= 0
            ? existing.mark
            : row.mark;
      } else {
        merged.set(key, {
          key,
          mark: row.mark,
          surfaceId: row.surfaceId,
          panelIds: [...row.panelIds],
          quantity: row.quantity,
          width: row.width,
          maximumLength: row.maximumLength,
          blankArea: row.blankArea,
        });
      }
    }
    return [...merged.values()].sort((a, b) =>
      a.mark.localeCompare(b.mark, "ru", { numeric: true }),
    );
  }, [grouped, rows, surfaceById, wallRal, roofRal, wallInsulation, roofInsulation]);

  return (
    <div className="table-page">
      <div className="table-controls">
        <button className={grouped ? "" : "active"} onClick={() => setGrouped(false)}>Все панели</button>
        <button className={grouped ? "active" : ""} onClick={() => setGrouped(true)}>Типы панелей</button>
        <input placeholder="Поиск типа" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select value={surfaceId} onChange={(event) => setSurfaceId(event.target.value)}>
          <option value="all">Все поверхности</option>
          {calculation.surfaces.map((surface) => <option key={surface.id} value={surface.id}>{surface.name}</option>)}
        </select>
      </div>
      <div className="table-scroll gost-scroll">
        <h2 className="gost-title">Спецификация сэндвич-панелей</h2>
        <table className="gost-spec">
          <colgroup>
            <col className="gost-pos" />
            <col className="gost-designation" />
            <col className="gost-name" />
            <col className="gost-qty" />
            <col className="gost-mass" />
            <col className="gost-note" />
          </colgroup>
          <thead>
            <tr>
              <th>Поз.</th>
              <th>Обозначение</th>
              <th>Наименование</th>
              <th>Кол.</th>
              <th>Масса<br />ед., кг</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {specRows.map((row) => {
              const isPanel = isPanelPiece(row);
              const rowSurfaceNames = isPanel
                ? surfaceById.get(row.surfaceId)?.name
                : surfaceNames(row.panelIds);
              return (
                <tr key={isPanel ? row.id : row.key} className={isPanel && row.id === selectedPanelId ? "selected-row" : ""} onClick={() => selectPanel(isPanel ? row.id : row.panelIds[0])}>
                  <td>{row.mark}</td>
                  <td>{designationForSurface(row.surfaceId)}</td>
                  <td>{panelName(row)}</td>
                  <td>{quantity(row)}</td>
                  <td>{kg(unitMass(row))}</td>
                  <td>{insulationLabel(insulationForSurface(row.surfaceId))}; {rowSurfaceNames}; расч.</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
