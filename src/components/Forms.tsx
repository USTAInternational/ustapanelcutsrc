import { useEffect, useRef, useState } from "react";
import { INSULATION_OPTIONS } from "../domain/panelOptions";
import { RAL_COLORS } from "../domain/ral";
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
export function ProjectForms() {
  const s = useProjectStore();
  return (
    <div className="form-stack">
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
      <PanelForm kind="wallPanelSystem" title="Стеновые панели" />
      <PanelForm kind="roofPanelSystem" title="Кровельные панели" />
      <OpeningsForm />
      <section>
        <h3>Расчет и цены</h3>
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
        <Num
          label="Тариф транспорта, сом/км"
          value={s.calculationSettings.transportRatePerKm}
          unit=""
          step={10}
          min={0}
          onChange={(n) => s.patchSettings({ transportRatePerKm: n })}
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
      <section>
        <h3>Коммерция и смета</h3>
        <Text
          label="Название объекта"
          value={s.commercial.objectName}
          placeholder="Напр.: Ангар 24×48 м"
          onChange={(objectName) => s.patchCommercial({ objectName })}
        />
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
        <Text
          label="Менеджер"
          value={s.commercial.managerName}
          onChange={(managerName) => s.patchCommercial({ managerName })}
        />
        <Text
          label="Телефон менеджера"
          value={s.commercial.managerPhone}
          onChange={(managerPhone) => s.patchCommercial({ managerPhone })}
        />
        <Text
          label="Завод (отправление)"
          value={s.commercial.factoryName}
          onChange={(factoryName) => s.patchCommercial({ factoryName })}
        />
        <Text
          label="Адрес завода"
          value={s.commercial.factoryAddress}
          onChange={(factoryAddress) => s.patchCommercial({ factoryAddress })}
        />
      </section>
    </div>
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
        {kind === "wallPanelSystem"
          ? "Горизонтальная раскладка, ширина 1000 мм"
          : "Вертикальная раскладка, длина рассчитывается по скату"}
      </small>
    </section>
  );
}
