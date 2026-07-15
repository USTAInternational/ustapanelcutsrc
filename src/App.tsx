import { useEffect, useRef, useState } from "react";
import { managerFields, ROLE_LABELS, useAuthStore } from "./auth/authStore";
import { Building3D } from "./components/Building3D";
import { CombinedUnfolding } from "./components/CombinedUnfolding";
import { ProjectForms } from "./components/Forms";
import { LoginPage } from "./components/LoginPage";
import { ProfileDialog } from "./components/ProfileDialog";
import { Specification } from "./components/Specification";
import { StructuralTab } from "./components/StructuralTab";
import { Summary } from "./components/Summary";
import { SurfaceDrawing } from "./components/SurfaceDrawing";
import type { ProjectInput } from "./domain/types";
import { ralHex } from "./domain/ral";
import { insulationLabel } from "./domain/panelOptions";
import {
  exportCsv,
  exportDxf,
  exportJson,
  exportPdf,
  exportSvg,
} from "./export/files";
import { useProjectStore } from "./store/projectStore";
import { migrateSavedProject } from "./validation/projectSchema";

export default function App() {
  const user = useAuthStore((v) => v.user);
  const s = useProjectStore(),
    [parametersOpen, setParametersOpen] = useState(true),
    [right, setRight] = useState(true),
    [profileOpen, setProfileOpen] = useState(false),
    file = useRef<HTMLInputElement>(null),
    surface = s.calculation.surfaces.find((v) => v.id === s.activeTab),
    panel = s.calculation.panels.find((v) => v.id === s.selectedPanelId),
    assemblyPanel = s.calculation.assembly.panels.find(
      (v) => v.panelId === s.selectedPanelId,
    ),
    input: ProjectInput = {
      building: s.building,
      roof: s.roof,
      wallPanelSystem: s.wallPanelSystem,
      roofPanelSystem: s.roofPanelSystem,
      flashingRalColor: s.flashingRalColor,
      openings: s.openings,
      calculationSettings: s.calculationSettings,
      commercial: s.commercial,
      structural: s.structural,
    };
  // Блок «Менеджер» заполняется из личного кабинета один раз при входе
  const patchCommercial = useProjectStore((v) => v.patchCommercial);
  useEffect(() => {
    if (user) patchCommercial(managerFields(user));
  }, [user, patchCommercial]);
  const importFile = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text()) as unknown;
      s.replaceProject(migrateSavedProject(raw));
      alert("Проект загружен");
    } catch (e) {
      alert(
        `Не удалось загрузить проект: ${e instanceof Error ? e.message : "неверный формат"}`,
      );
    }
  };
  if (!user) return <LoginPage />;
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">U</span>
          <div>
            <strong>USTA BIM</strong>
            <small>Раскладка панелей · Конструкции</small>
          </div>
        </div>
        <div className="header-actions">
          <button
            className={parametersOpen ? "active-control" : ""}
            onClick={() => setParametersOpen((v) => !v)}
          >
            Параметры
          </button>
          <button onClick={() => exportJson(input)}>JSON</button>
          <button onClick={() => file.current?.click()}>Загрузить</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) =>
              e.target.files?.[0] && importFile(e.target.files[0])
            }
          />
          <button onClick={() => exportCsv(s.calculation, input)}>CSV</button>
          <button onClick={() => exportDxf(s.calculation)}>DXF</button>
          <button
            onClick={() => {
              const svg =
                document.querySelector<SVGSVGElement>("svg.surface-svg");
              if (svg) exportSvg(svg);
            }}
            disabled={!surface && s.activeTab !== "unfolding"}
          >
            SVG
          </button>
          <button
            className="primary"
            onClick={() => exportPdf(input, s.calculation)}
          >
            {s.calculation.assembly.documentationBlocked ? "PDF (эскиз)" : "PDF"}
          </button>
          <button onClick={() => s.reset()}>Новый</button>
          <button onClick={() => setRight((v) => !v)}>Свойства</button>
          <button
            type="button"
            className="user-chip"
            title={`${user.email} · ${ROLE_LABELS[user.role]}`}
            onClick={() => setProfileOpen(true)}
          >
            {user.picture ? (
              <img src={user.picture} alt="" />
            ) : (
              <span className="user-avatar">
                {(user.fullName || user.email)[0]?.toUpperCase()}
              </span>
            )}
            <span className="user-name">{user.fullName || user.email}</span>
          </button>
        </div>
      </header>
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      <main className={right ? "" : "right-off"}>
        <section className="workspace">
          <nav className="tabs">
            <button
              className={s.activeTab === "3d" ? "active" : ""}
              onClick={() => s.setTab("3d")}
            >
              3D-модель
            </button>
            <button
              className={s.activeTab === "unfolding" ? "active" : ""}
              onClick={() => s.setTab("unfolding")}
            >
              Общая развертка
            </button>
            {s.calculation.surfaces.map((v) => (
              <button
                key={v.id}
                className={s.activeTab === v.id ? "active" : ""}
                onClick={() => s.setTab(v.id)}
              >
                {v.name}
              </button>
            ))}
            <button
              className={s.activeTab === "structural" ? "active" : ""}
              onClick={() => s.setTab("structural")}
            >
              Конструкции
            </button>
            <button
              className={s.activeTab === "spec" ? "active" : ""}
              onClick={() => s.setTab("spec")}
            >
              Ведомость
            </button>
            <button
              className={s.activeTab === "summary" ? "active" : ""}
              onClick={() => s.setTab("summary")}
            >
              Итоги
            </button>
          </nav>
          <div className="content">
            {s.activeTab === "3d" && <Building3D />}
            {s.activeTab === "unfolding" && <CombinedUnfolding />}
            {surface && (
              <SurfaceDrawing
                surface={surface}
                panelColor={ralHex(
                  surface.type === "roof"
                    ? s.roofPanelSystem.ralColor
                    : s.wallPanelSystem.ralColor,
                )}
                panels={s.calculation.panels.filter(
                  (p) => p.surfaceId === surface.id,
                )}
              />
            )}{" "}
            {s.activeTab === "structural" && <StructuralTab />}
            {s.activeTab === "spec" && <Specification />}
            {s.activeTab === "summary" && <Summary />}
          </div>
        </section>
        <aside className="right-panel">
          <h3>Свойства</h3>
          {panel ? (
            <div className="properties">
              <strong>{panel.mark}</strong>
              <dl>
                <dt>Поверхность</dt>
                <dd>
                  {
                    s.calculation.surfaces.find((v) => v.id === panel.surfaceId)
                      ?.name
                  }
                </dd>
                <dt>Толщина панели</dt>
                <dd>
                  {Math.round(
                    s.calculation.surfaces.find(
                      (surface) => surface.id === panel.surfaceId,
                    )?.type === "roof"
                      ? s.roofPanelSystem.thickness
                      : s.wallPanelSystem.thickness,
                  )} мм
                </dd>
                <dt>Цвет</dt>
                <dd>
                  {s.calculation.surfaces.find(
                    (surface) => surface.id === panel.surfaceId,
                  )?.type === "roof"
                    ? s.roofPanelSystem.ralColor
                    : s.wallPanelSystem.ralColor}
                </dd>
                <dt>Утеплитель</dt>
                <dd>
                  {insulationLabel(
                    s.calculation.surfaces.find(
                      (surface) => surface.id === panel.surfaceId,
                    )?.type === "roof"
                      ? s.roofPanelSystem.insulation
                      : s.wallPanelSystem.insulation,
                  )}
                </dd>
                <dt>Фактическая ширина</dt>
                <dd>{Math.round(panel.actualWidth)} мм</dd>
                <dt>Левая длина</dt>
                <dd>{Math.round(panel.leftLength)} мм</dd>
                <dt>Правая длина</dt>
                <dd>{Math.round(panel.rightLength)} мм</dd>
                <dt>Макс. длина</dt>
                <dd>{Math.round(panel.maximumLength)} мм</dd>
                {assemblyPanel?.supportSpan && (
                  <>
                    <dt>Между осями колонн</dt>
                    <dd>{Math.round(assemblyPanel.supportSpan.axisLengthMm)} мм</dd>
                    <dt>Длина с угловым выпуском</dt>
                    <dd>{Math.round(assemblyPanel.supportSpan.fabricationLengthMm)} мм</dd>
                    <dt>Видимая между планками</dt>
                    <dd>{Math.round(assemblyPanel.supportSpan.visibleLengthMm)} мм</dd>
                    <dt>Перекрытие фасонными</dt>
                    <dd>
                      {Math.round(assemblyPanel.supportSpan.startCoverMm)} + {Math.round(assemblyPanel.supportSpan.endCoverMm)} мм
                    </dd>
                  </>
                )}
                <dt>Видимая площадь</dt>
                <dd>{(panel.visibleArea / 1e6).toFixed(3)} м²</dd>
                <dt>Заготовка</dt>
                <dd>{(panel.blankArea / 1e6).toFixed(3)} м²</dd>
                <dt>Верхний рез</dt>
                <dd>{panel.topCutAngle?.toFixed(1)}°</dd>
                <dt>Координаты</dt>
                <dd>
                  {Math.round(panel.positionX)}; {Math.round(panel.positionY)}
                </dd>
              </dl>
              {panel.lengthExceeded && (
                <p className="alert">Превышена максимальная длина</p>
              )}
            </div>
          ) : (
            <p className="empty">
              Выберите панель на развертке или в ведомости.
            </p>
          )}
          <h3>Предупреждения</h3>
          <div className="warning-list">
            {s.calculation.warnings.slice(0, 10).map((w) => (
              <button
                key={w.id}
                onClick={() => w.panelId && s.selectPanel(w.panelId)}
              >
                {w.message}
              </button>
            ))}
          </div>
        </aside>
      </main>
      <section
        className={parametersOpen ? "parameter-dock" : "parameter-dock is-closed"}
        aria-label="Параметры проекта"
      >
        <ProjectForms />
      </section>
      <footer>
        Предварительный расчет. Не заменяет проектную документацию.
      </footer>
    </div>
  );
}
