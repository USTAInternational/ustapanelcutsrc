import { useMemo, useState } from "react";
import { insulationLabel } from "../domain/panelOptions";
import type { GroupedPanel, InsulationType, PanelPiece } from "../domain/types";
import type { StructuralResult } from "../calculation/structural";
import { useProjectStore } from "../store/projectStore";

const mm = (value: number) => Math.round(value).toLocaleString("ru-RU");
const kg = (value: number) => Math.round(value).toLocaleString("ru-RU");
const n1 = (value: number) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const n2 = (value: number) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
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

interface GostRow {
  position: string;
  designation: string;
  name: string;
  unit: string;
  quantity: number | string;
  unitMass?: number;
  note: string;
}

const isPanelPiece = (row: PanelPiece | GroupedPanel | SpecRow): row is PanelPiece =>
  "id" in row;

function SteelDesignation({
  profile,
  fallback = "ГОСТ 30245-2003",
}: {
  profile: string;
  fallback?: string;
}) {
  if (profile.includes("Швеллер") || profile.includes("[")) return "ГОСТ 8240-97";
  if (profile.includes("Двутавр") || /\d+К\d?/.test(profile)) return "ГОСТ 26020-83";
  if (profile.includes("□")) return "ГОСТ 30245-2003";
  return fallback;
}

function SpecificationTable({
  title,
  rows,
}: {
  title: string;
  rows: GostRow[];
}) {
  return (
    <div className="table-scroll gost-scroll">
      <h2 className="gost-title">{title}</h2>
      <table className="gost-spec gost-spec-wide">
        <colgroup>
          <col className="gost-pos" />
          <col className="gost-designation" />
          <col className="gost-name" />
          <col className="gost-unit" />
          <col className="gost-qty" />
          <col className="gost-mass" />
          <col className="gost-note" />
        </colgroup>
        <thead>
          <tr>
            <th>Поз.</th>
            <th>Обозначение</th>
            <th>Наименование</th>
            <th>Ед.</th>
            <th>Кол.</th>
            <th>Масса<br />ед., кг</th>
            <th>Примечание</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.position}>
              <td>{row.position}</td>
              <td>{row.designation}</td>
              <td>{row.name}</td>
              <td>{row.unit}</td>
              <td>
                {typeof row.quantity === "number" ? n2(row.quantity) : row.quantity}
              </td>
              <td>{row.unitMass == null ? "-" : kg(row.unitMass)}</td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function metalRows(r: StructuralResult): GostRow[] {
  const trussMassTotal = r.truss.massPerTrussKg * r.truss.count;
  const columnUnitMass = r.column.heightM * r.column.massKgM;
  const rows: GostRow[] = [
    {
      position: "КМ-1",
      designation: SteelDesignation({ profile: r.purlin.profile }),
      name: `Прогон ${r.purlin.profile}, L=${n1(r.purlin.spanM)} м`,
      unit: "шт",
      quantity: r.purlin.count,
      unitMass: r.purlin.count > 0 ? r.purlin.totalMassKg / r.purlin.count : 0,
      note: `Шаг ${n1(r.purlin.stepM)} м; всего ${n1(r.purlin.totalLengthM)} пог.м`,
    },
    {
      position: "КМ-2",
      designation: "ГОСТ 30245-2003",
      name: `Ферма стропильная L=${n1(r.truss.spanM)} м, H=${n1(r.truss.heightM)} м`,
      unit: "шт",
      quantity: r.truss.count,
      unitMass: r.truss.massPerTrussKg,
      note: `Пояса ${r.truss.topChord}/${r.truss.bottomChord}; решётка ${r.truss.diagonals}/${r.truss.verticals}; всего ${kg(trussMassTotal)} кг`,
    },
    {
      position: "КМ-3",
      designation: SteelDesignation({ profile: r.column.section }),
      name: `Колонна ${r.column.section}, H=${n1(r.column.heightM)} м`,
      unit: "шт",
      quantity: r.column.count,
      unitMass: columnUnitMass,
      note: `${r.column.manual ? "Задано" : "Подобрано"}; сталь С245; всего ${kg(columnUnitMass * r.column.count)} кг`,
    },
  ];
  if (r.openingFrames.count > 0) {
    rows.push({
      position: "КМ-4",
      designation: "ГОСТ 30245-2003",
      name: "Рама обрамления проёмов из профильной трубы",
      unit: "компл.",
      quantity: r.openingFrames.count,
      unitMass: r.openingFrames.totalMassKg / r.openingFrames.count,
      note: `${r.openingFrames.profiles}; всего ${n1(r.openingFrames.totalLengthM)} пог.м`,
    });
  }
  rows.push({
    position: "Итого",
    designation: "-",
    name: "Металлоконструкции каркаса",
    unit: "кг",
    quantity: kg(r.totalSteelKg),
    unitMass: undefined,
    note: "Предварительная ведомость по расчётной схеме КМ",
  });
  return rows;
}

function concreteRows(r: StructuralResult): GostRow[] {
  const f = r.foundation;
  const foundationName =
    f.type === "strip"
      ? `Фундамент ленточный ${f.widthMm}×${f.heightMm} мм`
      : `Фундамент столбчатый ${f.widthMm}×${f.widthMm}×${f.heightMm} мм`;
  const foundationQty =
    f.type === "strip" ? `${n1(f.lengthM)} пог.м` : `${f.count} шт`;
  return [
    {
      position: "ЖБ-1",
      designation: "ГОСТ 26633-2015",
      name: `${foundationName}, ${f.concrete}`,
      unit: "м³",
      quantity: f.volumeM3,
      unitMass: 2400,
      note: `${foundationQty}; глубина заложения ${n1(f.depthMm / 1000)} м`,
    },
    {
      position: "ЖБ-2",
      designation: "ГОСТ 34028-2016",
      name: `Рабочая арматура ${f.mainRebar}`,
      unit: "кг",
      quantity: f.rebarMassKg,
      unitMass: undefined,
      note: `Защитный слой ${f.coverMm} мм; ${f.rebarLayers} слой`,
    },
    {
      position: "ЖБ-3",
      designation: "ГОСТ 5781-82",
      name: `Поперечная арматура / хомуты ${f.stirrups}`,
      unit: "компл.",
      quantity: 1,
      unitMass: undefined,
      note: `Учтено в общей массе арматуры ${kg(f.rebarMassKg)} кг`,
    },
    {
      position: "Итого",
      designation: "-",
      name: "Железобетонные конструкции фундамента",
      unit: "компл.",
      quantity: 1,
      unitMass: undefined,
      note: `Бетон ${n2(f.volumeM3)} м³; арматура ${kg(f.rebarMassKg)} кг`,
    },
  ];
}

function PanelSpecification() {
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
    <>
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
    </>
  );
}

export function Specification() {
  const structural = useProjectStore((state) => state.calculation.structural);
  const [sheet, setSheet] = useState<"panels" | "metal" | "concrete">("panels");
  const rows = useMemo(
    () => ({
      metal: metalRows(structural),
      concrete: concreteRows(structural),
    }),
    [structural],
  );

  return (
    <div className="table-page">
      <div className="table-controls spec-sheet-controls">
        <button
          className={sheet === "panels" ? "active" : ""}
          onClick={() => setSheet("panels")}
        >
          Сэндвич-панели
        </button>
        <button
          className={sheet === "metal" ? "active" : ""}
          onClick={() => setSheet("metal")}
        >
          Металлоконструкции
        </button>
        <button
          className={sheet === "concrete" ? "active" : ""}
          onClick={() => setSheet("concrete")}
        >
          ЖБ фундамента
        </button>
      </div>
      {sheet === "panels" && <PanelSpecification />}
      {sheet === "metal" && (
        <SpecificationTable
          title="Ведомость металлических конструкций"
          rows={rows.metal}
        />
      )}
      {sheet === "concrete" && (
        <SpecificationTable
          title="Ведомость железобетонных конструкций фундамента"
          rows={rows.concrete}
        />
      )}
    </div>
  );
}
