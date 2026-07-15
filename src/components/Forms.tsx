import { useEffect, useRef, useState } from "react";
import {
  COLUMN_SECTIONS,
  COLUMN_TYPE_LABELS,
  PURLIN_PROFILES,
  SOIL_TYPES,
} from "../calculation/structural";
import type { ColumnType, FoundationType } from "../domain/types";
import { defaultProject } from "../domain/defaultProject";
import {
  INSULATION_OPTIONS,
  PANEL_SERIES_OPTIONS,
  panelSeriesDefaults,
} from "../domain/panelOptions";
import { importPriceSheet } from "../domain/priceImport";
import { PROJECT_TEMPLATES } from "../domain/projectTemplates";
import { RAL_COLORS } from "../domain/ral";
import { KG_REGIONS, regionById } from "../domain/regions";
import type { Opening } from "../domain/types";
import { resolveRoof } from "../geometry/surfaces";
import { useProjectStore } from "../store/projectStore";
type NumProps = {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
};
function Num({
  label,
  value,
  onChange,
  unit = "м",
  step = 0.1,
  min,
  max,
}: NumProps) {
  const [local, setLocal] = useState(
    String(unit === "м" ? value / 1000 : value),
  );
  useEffect(
    () => setLocal(String(unit === "м" ? value / 1000 : value)),
    [value, unit],
  );
  useEffect(() => {
    const id = setTimeout(() => {
      const n = Number(local);
      if (Number.isFinite(n)) onChange(unit === "м" ? n * 1000 : n);
    }, 150);
    return () => clearTimeout(id);
  }, [local]);
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const value = Number(local);
            if (!Number.isFinite(value)) return;
            if (min !== undefined && value < min) setLocal(String(min));
            if (max !== undefined && value > max) setLocal(String(max));
          }}
        />
        <em>{unit}</em>
      </div>
    </label>
  );
}
const Text = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <label className="field">
    <span>{label}</span>
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);
const Select = ({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) => (
  <label className="field">
    <span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  </label>
);
function RalPalette({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = RAL_COLORS.find((color) => color.code === value) ?? RAL_COLORS[0];
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="field ral-field">
      <span>Цвет RAL</span>
      <button
        type="button"
        className="ral-selected"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span className="ral-selected-swatch" style={{ backgroundColor: selected.hex }} />
        <div><strong>{selected.code}</strong><small>{selected.name}</small></div>
        <span className="ral-open-label">Выбрать</span>
      </button>
      <dialog
        ref={dialogRef}
        className="ral-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="ral-dialog-card">
          <header className="ral-dialog-header">
            <div><strong>Цвет RAL</strong><small>Выберите оттенок панели</small></div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Закрыть">×</button>
          </header>
          <div className="ral-dialog-palette" role="listbox" aria-label="Палитра цветов RAL">
            {RAL_COLORS.map((color) => (
              <button
                type="button"
                key={color.code}
                className={color.code === value ? "ral-option selected" : "ral-option"}
                title={`${color.code} — ${color.name}`}
                aria-label={`${color.code} — ${color.name}`}
                aria-selected={color.code === value}
                role="option"
                onClick={() => {
                  onChange(color.code);
                  dialogRef.current?.close();
                }}
              >
                <span className="ral-option-color" style={{ backgroundColor: color.hex }} />
                <small>{color.code.replace("RAL ", "")}</small>
              </button>
            ))}
          </div>
          <p className="ral-note">Экранные оттенки являются приближением RAL Classic.</p>
        </div>
      </dialog>
    </div>
  );
}
// Паспорт объекта заполняется в самом начале: геометка (регион) сразу
// определяет снеговую и ветровую нагрузки и транспортное плечо доставки.
function ObjectForm() {
  const s = useProjectStore();
  const region = regionById(s.structural.regionId);
  const [templateId, setTemplateId] = useState(PROJECT_TEMPLATES[0]?.id ?? "");
  return (
    <section className="object-section">
      <h3>Объект</h3>
      <Select
        label="Типовой шаблон"
        value={templateId}
        onChange={setTemplateId}
      >
        {PROJECT_TEMPLATES.map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => {
          const template = PROJECT_TEMPLATES.find((item) => item.id === templateId);
          if (!template) return;
          s.replaceProject({
            ...defaultProject,
            ...template.data,
            building: { ...defaultProject.building, ...template.data.building },
            roof: { ...defaultProject.roof, ...template.data.roof },
            commercial: { ...defaultProject.commercial, ...template.data.commercial },
            openings: template.data.openings ?? [],
          });
        }}
      >
        Загрузить шаблон
      </button>
      <Text
        label="Название объекта"
        value={s.commercial.objectName}
        placeholder="Напр.: Ангар 24×48 м"
        onChange={(objectName) => s.patchCommercial({ objectName })}
      />
      <Select
        label="Регион (локация)"
        value={s.structural.regionId}
        onChange={(regionId) => s.setRegion(regionId)}
      >
        {KG_REGIONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <small className="field-hint region-hint">
        Снег {region.snowDistrict} район · Sg {region.snowLoadKpa} кПа · ветер{" "}
        {region.windDistrict} район · доставка ~{region.transportKm} км
      </small>
      <Text
        label="Адрес объекта"
        value={s.commercial.objectAddress}
        placeholder="Город, улица, ориентир"
        onChange={(objectAddress) => s.patchCommercial({ objectAddress })}
      />
      <Text
        label="Заказчик"
        value={s.commercial.customer}
        placeholder="ФИО или ОсОО"
        onChange={(customer) => s.patchCommercial({ customer })}
      />
      <Text
        label="Контакт"
        value={s.commercial.contact}
        placeholder="+996 ..."
        onChange={(contact) => s.patchCommercial({ contact })}
      />
    </section>
  );
}
// Лист «2. Конструкции»: входы каскада и краткий результат подбора.
function StructuralForm() {
  const s = useProjectStore();
  const r = s.calculation.structural;
  const rows: [string, string][] = [
    ["Прогон", `${r.purlin.profile}, шаг ${r.purlin.stepM} м`],
    [
      "Ферма",
      `H ${r.truss.heightM.toFixed(2)} м, пояс ${r.truss.topChord}`,
    ],
    [
      "Колонна",
      `${r.column.section} · ${Math.round(r.column.usage * 100)}%`,
    ],
    [
      "Фундамент",
      r.foundation.type === "strip"
        ? `лента ${r.foundation.widthMm}×${r.foundation.heightMm} мм`
        : `плита ${r.foundation.widthMm}×${r.foundation.widthMm}×${r.foundation.heightMm} мм`,
    ],
  ];
  return (
    <section>
      <h3>Конструкции</h3>
      <Num
        label="Шаг колонн / ферм"
        value={s.structural.columnStep}
        step={0.5}
        min={2}
        max={12}
        onChange={(columnStep) => s.patchStructural({ columnStep })}
      />
      <Select
        label="Прогон"
        value={s.structural.purlinProfile}
        onChange={(purlinProfile) => s.patchStructural({ purlinProfile })}
      >
        <option value="auto">Авто — подбор по нагрузке</option>
        {PURLIN_PROFILES.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} · {p.massKgM} кг/м
          </option>
        ))}
      </Select>
      <Select
        label="Тип колонны"
        value={s.structural.columnType}
        onChange={(columnType) =>
          s.patchStructural({
            columnType: columnType as ColumnType,
            columnSection: "auto",
          })
        }
      >
        {(Object.keys(COLUMN_TYPE_LABELS) as ColumnType[]).map((type) => (
          <option key={type} value={type}>
            {COLUMN_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>
      <Select
        label="Сечение колонны"
        value={s.structural.columnSection}
        onChange={(columnSection) => s.patchStructural({ columnSection })}
      >
        <option value="auto">Авто — подбор по N и гибкости</option>
        {COLUMN_SECTIONS[s.structural.columnType].map((section) => (
          <option key={section.name} value={section.name}>
            {section.name} · {section.massKgM} кг/м
          </option>
        ))}
      </Select>
      <Select
        label="Тип фундамента"
        value={s.structural.foundationType}
        onChange={(foundationType) =>
          s.patchStructural({
            foundationType: foundationType as FoundationType,
          })
        }
      >
        <option value="strip">Ленточный по периметру</option>
        <option value="pad">Столбчатый под колонны</option>
      </Select>
      <Select
        label="Тип грунта"
        value={s.structural.soilId}
        onChange={(soilId) => s.patchStructural({ soilId })}
      >
        <option value="auto">Авто — по региону</option>
        {SOIL_TYPES.map((soil) => (
          <option key={soil.id} value={soil.id}>
            {soil.name} · R {soil.range} кПа
          </option>
        ))}
      </Select>
      <Num
        label="Глубина заложения"
        value={s.structural.foundationDepth}
        step={0.1}
        min={0.8}
        max={2.5}
        onChange={(foundationDepth) => s.patchStructural({ foundationDepth })}
      />
      <Text
        label="Класс бетона фундамента"
        value={s.structural.foundationConcreteClass}
        onChange={(foundationConcreteClass) =>
          s.patchStructural({ foundationConcreteClass })
        }
      />
      <Select
        label="Класс рабочей арматуры"
        value={s.structural.foundationRebarClass}
        onChange={(foundationRebarClass) =>
          s.patchStructural({
            foundationRebarClass:
              foundationRebarClass as typeof s.structural.foundationRebarClass,
          })
        }
      >
        <option value="A500C">A500C</option>
        <option value="A400">A400</option>
      </Select>
      <Num
        label="Диаметр рабочей арматуры"
        value={s.structural.foundationMainRebarDiameterMm}
        unit="мм"
        step={2}
        min={8}
        max={32}
        onChange={(foundationMainRebarDiameterMm) =>
          s.patchStructural({ foundationMainRebarDiameterMm })
        }
      />
      <Num
        label="Диаметр хомутов"
        value={s.structural.foundationStirrupDiameterMm}
        unit="мм"
        step={2}
        min={6}
        max={16}
        onChange={(foundationStirrupDiameterMm) =>
          s.patchStructural({ foundationStirrupDiameterMm })
        }
      />
      <Num
        label="Шаг арматуры / хомутов"
        value={s.structural.foundationRebarStepMm}
        unit="мм"
        step={25}
        min={100}
        max={400}
        onChange={(foundationRebarStepMm) =>
          s.patchStructural({ foundationRebarStepMm })
        }
      />
      <Num
        label="Защитный слой бетона"
        value={s.structural.foundationCoverMm}
        unit="мм"
        step={5}
        min={30}
        max={100}
        onChange={(foundationCoverMm) =>
          s.patchStructural({ foundationCoverMm })
        }
      />
      <Num
        label="Вынос панелей от каркаса"
        value={s.structural.panelOffsetMm}
        unit="мм"
        step={10}
        min={0}
        max={300}
        onChange={(panelOffsetMm) => s.patchStructural({ panelOffsetMm })}
      />
      <Num
        label="Вентзазор / подсистема"
        value={s.structural.facadeVentGapMm}
        unit="мм"
        step={10}
        min={0}
        max={120}
        onChange={(facadeVentGapMm) => s.patchStructural({ facadeVentGapMm })}
      />
      <div className="struct-mini">
        {rows.map(([k, v]) => (
          <div className="struct-mini-row" key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <small className="field-hint">
        Подбор идёт сверху вниз: прогон → ферма → колонна → фундамент.
        «Авто» — расчёт по внешним габаритам; ручной выбор профилей — режим
        «по существующему каркасу» (лист 1) с проверкой заданных сечений.
        Подробности — на вкладке «Конструкции».
      </small>
    </section>
  );
}
export function ProjectForms() {
  const s = useProjectStore();
  const priceFile = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<
    "object" | "dimensions" | "panels" | "openings" | "structural" | "price" | "manager"
  >("dimensions");
  const sections = [
    ["object", "⌖", "Объект"],
    ["dimensions", "⌗", "Размеры и крыша"],
    ["panels", "▤", "Панели"],
    ["openings", "▢", "Проёмы"],
    ["structural", "⌂", "Конструкции"],
    ["price", "₸", "Расчёт и цены"],
    ["manager", "♟", "Менеджер"],
  ] as const;
  return (
    <div className="form-stack bottom-form-stack">
      <nav className="parameter-sections" aria-label="Разделы параметров">
        {sections.map(([id, icon, label]) => (
          <button
            type="button"
            key={id}
            className={activeSection === id ? "active" : ""}
            onClick={() => setActiveSection(id)}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="parameter-body">
        <div className={activeSection === "object" ? "parameter-group active" : "parameter-group"}>
          <ObjectForm />
        </div>
        <div className={activeSection === "dimensions" ? "parameter-group active" : "parameter-group"}>
          <section>
        <h3>Здание</h3>
        <Num
          label="Длина"
          value={s.building.length}
          onChange={(n) => s.patchBuilding({ length: n })}
        />
        <Num
          label="Ширина"
          value={s.building.width}
          onChange={(n) => s.patchBuilding({ width: n })}
        />
        <Num
          label="Высота стен"
          value={s.building.wallHeight}
          onChange={(n) => s.patchBuilding({ wallHeight: n })}
        />
      </section>
      <section>
        <h3>Крыша</h3>
        <Select
          label="Тип"
          value={s.roof.type}
          onChange={(v) => s.patchRoof({ type: v as typeof s.roof.type })}
        >
          <option value="flat">Плоская</option>
          <option value="mono">Односкатная</option>
          <option value="gable">Двускатная</option>
        </Select>
        {s.roof.type !== "flat" && (
          <>
            <Select
              label="Способ ввода"
              value={s.roof.inputMode}
              onChange={(v) =>
                s.patchRoof({ inputMode: v as "height" | "angle" })
              }
            >
              <option value="height">По высоте</option>
              <option value="angle">По углу</option>
            </Select>
            {s.roof.inputMode === "angle" ? (
              <Num
                label="Угол"
                value={s.roof.slopeAngle}
                unit="°"
                step={1}
                onChange={(n) => s.patchRoof({ slopeAngle: n })}
              />
            ) : (
              <Num
                label={
                  s.roof.type === "gable" ? "Высота конька" : "Высокая сторона"
                }
                value={
                  s.roof.type === "gable"
                    ? s.roof.ridgeHeight
                    : s.roof.highSideHeight
                }
                onChange={(n) =>
                  s.patchRoof(
                    s.roof.type === "gable"
                      ? { ridgeHeight: n }
                      : { highSideHeight: n },
                  )
                }
              />
            )}
          </>
        )}
        {s.roof.type !== "flat" &&
          (() => {
            const r = resolveRoof(s.building, s.roof);
            const high =
              s.roof.type === "gable" ? r.ridgeHeight : r.highSideHeight;
            return (
              <small className="field-hint roof-hint">
                {s.roof.inputMode === "angle"
                  ? `Расчёт: ${s.roof.type === "gable" ? "конёк" : "высокая сторона"} ${(high / 1000).toFixed(2)} м (стена ${(s.building.wallHeight / 1000).toFixed(2)} м, подъём ${((high - s.building.wallHeight) / 1000).toFixed(2)} м)`
                  : `Расчёт: уклон ${r.slopeAngle.toFixed(1)}° (подъём ${((high - s.building.wallHeight) / 1000).toFixed(2)} м на пролёте ${((s.roof.type === "gable" ? s.building.width / 2 : s.building.width) / 1000).toFixed(2)} м)`}
              </small>
            );
          })()}
        <Num
          label="Карнизный свес"
          value={s.roof.eaveOverhang}
          onChange={(n) => s.patchRoof({ eaveOverhang: n })}
        />
        <Num
          label="Торцевой свес"
          value={s.roof.gableOverhang}
          onChange={(n) => s.patchRoof({ gableOverhang: n })}
        />
      </section>
        </div>
        <div className={activeSection === "panels" ? "parameter-group active" : "parameter-group"}>
          <PanelForm kind="wallPanelSystem" title="Стеновые панели" />
          <PanelForm kind="roofPanelSystem" title="Кровельные панели" />
        </div>
        <div className={activeSection === "openings" ? "parameter-group active" : "parameter-group"}>
          <OpeningsForm />
        </div>
        <div className={activeSection === "structural" ? "parameter-group active" : "parameter-group"}>
          <StructuralForm />
        </div>
        <div className={activeSection === "price" ? "parameter-group active" : "parameter-group"}>
          <section>
        <h3>Расчет и цены</h3>
        <button type="button" onClick={() => priceFile.current?.click()}>
          Загрузить прайс Excel
        </button>
        <input
          ref={priceFile}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const patch = await importPriceSheet(file);
            s.patchSettings(patch);
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={s.calculationSettings.quickMode}
            onChange={(e) =>
              s.patchSettings({ quickMode: e.target.checked })
            }
          />
          Быстрый расчет без детальной раскладки
        </label>
        <Select
          label="Площадь для цены"
          value={s.calculationSettings.pricingMode}
          onChange={(v) =>
            s.patchSettings({
              pricingMode: v as typeof s.calculationSettings.pricingMode,
            })
          }
        >
          <option value="visible-area">Видимая</option>
          <option value="blank-area">Заготовка</option>
          <option value="nominal-area">Номинальная</option>
        </Select>
        <Num
          label="Запас"
          value={s.calculationSettings.reservePercent}
          unit="%"
          step={1}
          onChange={(n) => s.patchSettings({ reservePercent: n })}
        />
        <Num
          label="Монтажный зазор панели"
          value={s.calculationSettings.mountingGapMm}
          unit="мм"
          step={1}
          min={0}
          max={50}
          onChange={(mountingGapMm) => s.patchSettings({ mountingGapMm })}
        />
        <Num
          label="Температурный зазор"
          value={s.calculationSettings.thermalGapMm}
          unit="мм"
          step={1}
          min={0}
          max={20}
          onChange={(thermalGapMm) => s.patchSettings({ thermalGapMm })}
        />
        <Num
          label="Добор вокруг проемов"
          value={s.calculationSettings.openingClearanceMm}
          unit="мм"
          step={5}
          min={0}
          max={100}
          onChange={(openingClearanceMm) =>
            s.patchSettings({ openingClearanceMm })
          }
        />
        <Num
          label="Цена стен, сом/м²"
          value={s.calculationSettings.wallPricePerM2}
          unit=""
          step={100}
          onChange={(n) => s.patchSettings({ wallPricePerM2: n })}
        />
        <Num
          label="Цена кровли, сом/м²"
          value={s.calculationSettings.roofPricePerM2}
          unit=""
          step={100}
          onChange={(n) => s.patchSettings({ roofPricePerM2: n })}
        />
        <Num
          label="Монтаж панелей, сом/м²"
          value={s.calculationSettings.mountPanelPricePerM2}
          unit=""
          step={50}
          onChange={(n) => s.patchSettings({ mountPanelPricePerM2: n })}
        />
        <Num
          label="Монтаж фасонных, сом/пог.м"
          value={s.calculationSettings.mountFlashingPricePerM}
          unit=""
          step={50}
          onChange={(n) => s.patchSettings({ mountFlashingPricePerM: n })}
        />
        <Num
          label="Производительность, м²/день"
          value={s.calculationSettings.productivityPerDay}
          unit=""
          step={5}
          min={1}
          onChange={(n) => s.patchSettings({ productivityPerDay: n })}
        />
        <Num
          label="Расстояние доставки, км"
          value={s.calculationSettings.transportDistanceKm}
          unit=""
          step={1}
          min={0}
          onChange={(n) => s.patchSettings({ transportDistanceKm: n })}
        />
        <small className="field-hint">
          Заполняется автоматически по региону объекта, можно уточнить вручную.
        </small>
        <Num
          label="Тариф транспорта, сом/км"
          value={s.calculationSettings.transportRatePerKm}
          unit=""
          step={10}
          min={0}
          onChange={(n) => s.patchSettings({ transportRatePerKm: n })}
        />
        <Num
          label="Автокран, смен"
          value={s.calculationSettings.craneShifts}
          unit=""
          step={1}
          min={0}
          onChange={(craneShifts) => s.patchSettings({ craneShifts })}
        />
        <Num
          label="Автокран, сом/смена"
          value={s.calculationSettings.craneShiftPrice}
          unit=""
          step={1000}
          min={0}
          onChange={(craneShiftPrice) => s.patchSettings({ craneShiftPrice })}
        />
        <Num
          label="Леса / подмости, сом/м²"
          value={s.calculationSettings.scaffoldPricePerM2}
          unit=""
          step={10}
          min={0}
          onChange={(scaffoldPricePerM2) =>
            s.patchSettings({ scaffoldPricePerM2 })
          }
        />
        <Num
          label="Погодный резерв"
          value={s.calculationSettings.weatherRiskPercent}
          unit="%"
          step={1}
          min={0}
          max={30}
          onChange={(weatherRiskPercent) =>
            s.patchSettings({ weatherRiskPercent })
          }
        />
        <label className="check">
          <input
            type="checkbox"
            checked={s.calculationSettings.groupMirrored}
            onChange={(e) =>
              s.patchSettings({ groupMirrored: e.target.checked })
            }
          />
          Объединять зеркальные
        </label>
      </section>
        </div>
        <div className={activeSection === "manager" ? "parameter-group active" : "parameter-group"}>
          <ManagerCard />
        </div>
      </div>
    </div>
  );
}
// Блок «Менеджер»: данные приходят из личного кабинета авторизации,
// каждый раз заново их вводить не нужно.
function ManagerCard() {
  const s = useProjectStore();
  return (
    <section className="manager-card">
      <h3>Менеджер</h3>
      <div className="manager-info">
        <div>
          <span>Менеджер</span>
          <strong>{s.commercial.managerName || "—"}</strong>
        </div>
        <div>
          <span>Телефон</span>
          <strong>{s.commercial.managerPhone || "—"}</strong>
        </div>
        <div>
          <span>Завод (отправление)</span>
          <strong>{s.commercial.factoryName || "—"}</strong>
        </div>
        <div>
          <span>Адрес завода</span>
          <strong>{s.commercial.factoryAddress || "—"}</strong>
        </div>
      </div>
      <small className="field-hint">
        Изменяется в личном кабинете (иконка профиля в шапке).
      </small>
    </section>
  );
}
const OPENING_TYPES: { value: Opening["type"]; label: string }[] = [
  { value: "window", label: "Окно" },
  { value: "door", label: "Дверь" },
  { value: "gate", label: "Ворота" },
];
const openingTypeLabel = (t: Opening["type"]) =>
  OPENING_TYPES.find((o) => o.value === t)?.label ?? t;
function OpeningsForm() {
  const s = useProjectStore();
  const walls = s.calculation.surfaces.filter((v) => v.type !== "roof");
  const [draft, setDraft] = useState({
    surfaceId: "wall-a",
    type: "window" as Opening["type"],
    x: 1000,
    y: 1000,
    width: 1500,
    height: 1500,
  });
  const add = () => {
    if (draft.width <= 0 || draft.height <= 0) return;
    s.addOpening({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()),
      name: openingTypeLabel(draft.type),
      ...draft,
    });
  };
  return (
    <section>
      <h3>Проёмы и отверстия</h3>
      <Select
        label="Фасад"
        value={draft.surfaceId}
        onChange={(surfaceId) => setDraft({ ...draft, surfaceId })}
      >
        {walls.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
      <Select
        label="Тип"
        value={draft.type}
        onChange={(type) =>
          setDraft({ ...draft, type: type as Opening["type"] })
        }
      >
        {OPENING_TYPES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Num
        label="Отступ слева"
        value={draft.x}
        onChange={(x) => setDraft((d) => ({ ...d, x }))}
      />
      <Num
        label="Отступ снизу"
        value={draft.y}
        onChange={(y) => setDraft((d) => ({ ...d, y }))}
      />
      <Num
        label="Ширина проёма"
        value={draft.width}
        onChange={(width) => setDraft((d) => ({ ...d, width }))}
      />
      <Num
        label="Высота проёма"
        value={draft.height}
        onChange={(height) => setDraft((d) => ({ ...d, height }))}
      />
      <button type="button" className="primary" onClick={add}>
        Добавить проём
      </button>
      {s.openings.map((o) => (
        <div className="opening-row" key={o.id}>
          <span>
            {openingTypeLabel(o.type)} ·{" "}
            {walls.find((w) => w.id === o.surfaceId)?.name ?? o.surfaceId} ·{" "}
            {(o.width / 1000).toFixed(2)}×{(o.height / 1000).toFixed(2)} м
          </span>
          <button type="button" onClick={() => s.removeOpening(o.id)}>
            ✕
          </button>
        </div>
      ))}
      {!s.openings.length && (
        <p className="empty">Проёмы вычитаются из видимой площади и обрамляются фасонными элементами.</p>
      )}
    </section>
  );
}
function PanelForm({
  kind,
  title,
}: {
  kind: "wallPanelSystem" | "roofPanelSystem";
  title: string;
}) {
  const s = useProjectStore(),
    p = s[kind],
    patch = (v: Partial<typeof p>) => s.patchPanel(kind, v);
  return (
    <section>
      <h3>{title}</h3>
      <Select
        label="Серия панели"
        value={p.series}
        onChange={(series) =>
          patch({
            ...panelSeriesDefaults(series as typeof p.series),
            series: series as typeof p.series,
          })
        }
      >
        {PANEL_SERIES_OPTIONS.filter((option) =>
          kind === "roofPanelSystem"
            ? option.value === "roof-tsp"
            : option.value !== "roof-tsp",
        ).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Num
        label="Толщина панели"
        value={p.thickness}
        unit="мм"
        step={10}
        min={20}
        max={300}
        onChange={(thickness) => patch({ thickness })}
      />
      <Select
        label="Утеплитель"
        value={p.insulation}
        onChange={(insulation) =>
          patch({ insulation: insulation as typeof p.insulation })
        }
      >
        {INSULATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      <RalPalette value={p.ralColor} onChange={(ralColor) => patch({ ralColor })} />
      <small className="field-hint">
        Серия: {
          PANEL_SERIES_OPTIONS.find((option) => option.value === p.series)?.note ??
          "типовая серия"
        }
      </small>
    </section>
  );
}
