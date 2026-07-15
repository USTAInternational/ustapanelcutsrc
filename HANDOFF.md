# HANDOFF: USTA BIM Project Transfer

This document guides the new team (codex) through taking over the USTA BIM codebase.

---

## Quick Start for New Team

### 0. Clone and Setup
```bash
git clone https://github.com/USTAInternational/ustaBIM.online_Panels.git
cd ustaBIM.online_Panels
git checkout claude/construction-page-gmail-auth-t7gldb

npm install
npm run dev
```
Visit http://localhost:5173

### 1. Understand the Project Flow
1. User enters **Object** (name, region, address) → region auto-fills snow/wind loads and soil
2. User enters **Building** (plan: length×width, wall height) + **Roof** (type, ridge height)
3. User layouts **Panels** (walls + roof) and **Openings** (windows/doors)
4. System auto-calculates **Sheet "2. Конструкции"** (cascade structural design):
   - Top-down: Purlin → Truss → Column → Foundation
   - Each step's output (load, mass) drives the next
5. User can toggle **3D view** (All / Panels / Frame)
6. (TODO) Export **PDF sketches** (эскизный проект, 9 sheets A3)

### 2. Key Repositories and Branches
- **Repo**: USTAInternational/ustaBIM.online_Panels
- **Working branch**: `claude/construction-page-gmail-auth-t7gldb`
- **Default branch**: `main` (not yet merged; currently PR #1 in draft)
- **Vercel preview**: auto-deployed from PR

### 3. Current Status
- ✅ **43 tests passing** (Vitest)
- ✅ **All structural cascade logic implemented** (purlin → truss → column → foundation)
- ✅ **Variability modes** (auto-pick vs manual selection with validation)
- ✅ **3D frame rendering** (toggle: all / panels / frame)
- ✅ **Google OAuth integration** (demo mode works without VITE_GOOGLE_CLIENT_ID)
- ❌ **PDF export** (pending sign-off on 9-sheet structure)

---

## Project Structure Overview

```
ustaBIM.online_Panels/
├── src/
│   ├── domain/                 # Types & catalogs
│   │   ├── types.ts            # Main Project type & StructuralSettings
│   │   ├── regions.ts          # KG_REGIONS, panelWeightKgM2(), windHeightFactor()
│   │   ├── defaultProject.ts   # Defaults, factory info (FreeLAB)
│   │   └── colors.ts           # RAL palette
│   ├── calculation/
│   │   ├── structural.ts       # ⭐ CASCADE LOGIC ⭐
│   │   │   ├── PURLIN_PROFILES catalog
│   │   │   ├── COLUMN_SECTIONS by type
│   │   │   ├── selectPurlin(), selectTruss(), selectColumn(), selectFoundation()
│   │   │   └── calculateStructural() — main entry point
│   │   ├── geometry.ts         # Surfaces, layout, clipping
│   │   └── index.ts            # ProjectCalculation aggregator
│   ├── store/
│   │   └── projectStore.ts     # Zustand + localStorage
│   ├── auth/
│   │   └── authStore.ts        # UserProfile, Google OAuth
│   ├── components/
│   │   ├── LoginForm.tsx       # Google Identity Services UI
│   │   ├── Forms.tsx           # Object/Building/Roof/Panels/Openings/Structural input forms
│   │   ├── StructuralTab.tsx   # Sheet "2. Конструкции" — 4 cascade cards
│   │   ├── Building3D.tsx      # Three.js canvas + viewMode toggle
│   │   └── ...others
│   ├── tests/
│   │   └── structural.test.ts  # 43 tests (Vitest)
│   ├── styles.css              # USTA theme
│   ├── App.tsx                 # Main multi-tab layout
│   └── main.tsx                # Entry point
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── README.md                    # Full documentation
└── HANDOFF.md                   # This file
```

---

## Critical Module: Structural Cascade (src/calculation/structural.ts)

### Entry Point: `calculateStructural()`
```typescript
export function calculateStructural(
  building: Building,      // plan (length, width, wallHeight)
  roof: Roof,              // type, height
  panelWidthMm: number,    // panel width profile
  panelHeightMm: number,   // panel height profile
  settings: StructuralSettings  // region, columnType, columnSection, purlinProfile, etc.
): StructuralResult {
  // Step 1: Calculate loads (panel weight, snow, wind)
  const loads = { panelWeightKgM2, snowKgM2, windKgM2, totalKgM2 };
  
  // Step 2: Select purlin (check stress & deflection)
  const purlin = selectPurlin(loads, roof.spanM, settings.purlinProfile);
  
  // Step 3: Select truss (using purlin load + mass)
  const truss = selectTruss(loads, purlin, roof, building.width);
  
  // Step 4: Select column (using truss load)
  const column = selectColumn(truss, building.wallHeight, settings.columnType, settings.columnSection);
  
  // Step 5: Select foundation (using column load)
  const foundation = selectFoundation(column, building.length, settings.foundationType, settings.soilId);
  
  return { loads, purlin, truss, column, foundation };
}
```

### Each Step is a Function:

#### `selectPurlin(loads, spanM, profileHint?)`
- **Input**: total load (kgM2), roof span
- **Mode auto**: iterate PURLIN_PROFILES, first passing → return
- **Mode manual**: validate user-selected profile, return with manual=true if ok, or warning
- **Checks**: 
  - Stress: σ = M·Wx ≤ Ry·γc (bending strength)
  - Deflection: δ ≤ l/200 (max sag)
- **Output**: { profile, stepM, loadKgM, stressUsage, deflectionUsage, count, mass }

#### `selectTruss(loads, purlin, roof, buildingWidth)`
- **Input**: loads + purlin result (nesting: new load = old + purlin mass)
- **Height**: H = span / 7 OR 6 (narrower vs wider building rule)
- **Chord force**: F = q·L / (2·sinθ) where θ = arctan(H / (L/2))
- **Iterate tube profiles** (40×40, 50×50, 60×60 with various thickness)
  - Check: strength σ = F/A ≤ Ry·γc
  - First passing → return
- **Output**: { heightM, loadKnM, topChord, bottomChord, diagonals, verticals, lattice, count, mass }

#### `selectColumn(trussResult, wallHeightM, columnType, columnSectionHint?)`
- **Input**: truss load, wall height
- **Stress**: N (load in kN) = trussLoadKnM × (spanM/2) × 1.02
- **Height**: H = wallHeight + trussHeight
- **Iterate COLUMN_SECTIONS[columnType]**:
  - λ = H / i (slenderness ratio)
  - φ(λ) from buckling table (see `buckling()` function)
  - Check: N/(φ·A·Ry·γc) ≤ 1 AND λ ≤ 140
  - First passing → return
- **Output**: { section, λ, φ, usage, heightM, count, iBeam, tube, doubleChannel (analogs) }

#### `selectFoundation(columnResult, buildingLength, foundationType, soilId)`
- **Input**: column load
- **Type**: strip (linear footing) or pad (square foundation under each column)
- **Width formula**:
  - Strip: B = N / (R × (1 − 0.1×depth))
  - Pad: a = √(N / (R × (1 − 0.1×depth)))
  - Min: 400 mm (strip), 800 mm (pad), multiple of 100 mm
- **Rebar**: select by width (A500)
- **Concrete**: B20+
- **Output**: { type, widthMm, heightMm, count, concrete, rebar }

---

## State Management: Zustand Store

### File: `src/store/projectStore.ts`

**Main state**:
```typescript
type ProjectState = {
  project: Project;                    // Full project
  calculation: ProjectCalculation;    // Computed results (loads, 3D geometry, etc.)
  
  // Helpers
  patchStructural(patch: Partial<StructuralSettings>): void;
  setRegion(regionId: string): void;  // Auto-fill loads, soil, transport
  // ... other setters
};

const useProjectStore = create<ProjectState>(...);
```

**Common operations**:
```typescript
// Get current state
const project = useProjectStore((s) => s.project);
const structural = project.structural;  // StructuralSettings

// Update structural settings
useProjectStore.setState((s) => ({
  project: { ...s.project, structural: { ...s.project.structural, columnType: "tube" } }
}));
// OR use helper
useProjectStore((s) => s.patchStructural({ columnType: "tube" }));

// Get calculated cascade results
const cascadeResults = useProjectStore((s) => s.calculation.structural);
// cascadeResults.purlin, .truss, .column, .foundation
```

---

## UI Entry Points

### How Users Navigate:
1. **LoginForm** → authenticate via Google (or demo)
2. **App.tsx** → tab navigation:
   - Tab 1: Object (name, location, address, customer)
   - Tab 2: Building (plan: length×width, wall height)
   - Tab 3: Roof (type: flat/single/gable, height)
   - Tab 4: Panels (layout on walls + roof, select RAL color)
   - Tab 5: Openings (windows, doors — add/remove)
   - Tab 6: **Sheet "2. Конструкции"** (StructuralTab.tsx)
   - Tab 7: 3D Model (Building3D.tsx with ViewMode toggle)
   - Tab 8: Export (not yet implemented — PDF export)

### Key Component: `StructuralTab.tsx`
- Shows 4 cascade cards (purlin, truss, column, foundation)
- Each card displays:
  - Profile/section name
  - Key parameters (load, span, height, λ, φ)
  - Usage % (green ✓ | orange ⚠ | red ✗)
  - Material (steel/concrete/rebar)

### 3D View: `Building3D.tsx`
- Three.js canvas with Orbit controls
- **ViewMode toggle** (top-right buttons):
  - Всё (All) = panels + frame
  - Панели (Panels) = only surfaces
  - Каркас (Frame) = only skeleton (columns, trusses, purlins, foundation)

---

## Testing Strategy (Vitest)

### File: `src/tests/structural.test.ts`

**Run tests**:
```bash
npm run test
```

**Key test groups**:
1. **Regions** (8 regions, interpolation)
2. **Cascade** (each step returns ok=true when checks pass)
3. **Truss height** (L/7…L/6 rule)
4. **Load cascade** (purlin load → truss load → column load)
5. **Column** (λ ≤ 140, φ > 0, usage ≤ 0.85)
6. **Manual selection** (user can pick section, system validates)
7. **Pad foundation** (width ≥ 800mm, multiple of 100mm)

**When adding new logic**:
- Add test in `structural.test.ts`
- Test should verify both "auto mode" (first passing) and "manual mode" (user selection + validation)
- Example:
  ```typescript
  it("new feature: ...", () => {
    const result = calculateStructural(building, roof, 100, 100, settings);
    expect(result.newFeature.ok).toBe(true);
    expect(result.newFeature.value).toBeGreaterThan(0);
  });
  ```

---

## Common Tasks

### Task 1: Add a New Region
1. Edit `src/domain/regions.ts`:
   ```typescript
   export const KG_REGIONS: Region[] = [
     // ... existing
     {
       id: "new-region",
       name: "Новый Регион",
       snowLoadKpa: 2.5,
       windPressureKpa: 0.55,
       soilId: "sandy",
       transportKm: 450,
     }
   ];
   ```
2. Update test in `src/tests/structural.test.ts`:
   ```typescript
   expect(KG_REGIONS).toHaveLength(9);  // was 8
   ```
3. Test locally: `npm run test`

### Task 2: Add a New Purlin Profile
1. Edit `src/calculation/structural.ts`:
   ```typescript
   export const PURLIN_PROFILES: PurlinProfile[] = [
     // ... existing
     {
       name: "Швеллер 32",
       wx: 515,  // moment of resistance (mm³)
       massKgM: 45.3,
       maxStepM: 6.0,  // recommended max spacing
     }
   ];
   ```
2. Test: `npm run test` (auto cascade tests should pick it if needed)

### Task 3: Add a New Column Section
1. Edit `src/calculation/structural.ts`:
   ```typescript
   export const COLUMN_SECTIONS: Record<ColumnType, ColumnSection[]> = {
     ibeam: [
       // ... existing
       { name: "50K2", areaM2: 0.0165, ixMm: 1900, iyMm: 850, iMin: 18 }
     ],
     // ... other types
   };
   ```
2. Update default in `src/domain/defaultProject.ts`:
   ```typescript
   columnSection: "auto",  // or specific name for manual mode
   ```

### Task 4: Implement PDF Export
1. Create `src/export/pdf.ts` with function:
   ```typescript
   export async function generateEskiznyiProekt(calc: ProjectCalculation): Promise<Blob> {
     // Use jsPDF + html2canvas
     // 9 sheets: cover, general, axes, frame, facades, roof, specs, estimate, notes
     return pdfBlob;
   }
   ```
2. Add button in `StructuralTab.tsx` or new "Export" tab:
   ```typescript
   <button onClick={() => generateEskiznyiProekt(s.calculation).then(blob => downloadPdf(blob))}>
     Скачать PDF
   </button>
   ```
3. Add tests in `structural.test.ts`:
   ```typescript
   it("PDF export includes all cascade data", async () => {
     const blob = await generateEskiznyiProekt(baseResult);
     expect(blob.size).toBeGreaterThan(0);
   });
   ```

### Task 5: Add Seismic Load Factor (for КР 8–9 regions)
1. Edit `src/domain/regions.ts`:
   ```typescript
   export interface Region {
     // ... existing
     seismicFactor?: number;  // e.g., 1.0–1.5 depending on КР balloons
   }
   ```
2. Update `calculateStructural()` in `src/calculation/structural.ts`:
   ```typescript
   const seismicMultiplier = region.seismicFactor || 1.0;
   const totalLoadKgM2 = (panelWeight + snowKgM2 + windKgM2) * seismicMultiplier;
   ```
3. Add test.

---

## Environment Variables

### Local Development (.env.local)
```
VITE_GOOGLE_CLIENT_ID=<optional for demo mode>
```

### Production (Vercel)
Set in Vercel project settings:
```
VITE_GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
```

To enable real Google auth:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 Client ID (type: Web Application)
3. Authorized origins: `https://<your-vercel-domain>`
4. Authorized redirect URIs: `https://<your-vercel-domain>/`
5. Copy Client ID → Vercel env var

Without VITE_GOOGLE_CLIENT_ID, app works in **demo mode** (Google button hidden, any email accepted).

---

## Deployment & CI/CD

### Local → Remote Workflow:
```bash
# 1. Make changes locally
npm run dev        # test
npm run typecheck  # type check
npm run test       # unit tests

# 2. Commit
git add .
git commit -m "Feature: ..."

# 3. Push to working branch
git push -u origin claude/construction-page-gmail-auth-t7gldb

# 4. Vercel auto-deploys PR preview
# 5. When ready: merge PR → main
# 6. Vercel auto-deploys production
```

### Vercel Preview URLs:
- PR preview: auto-generated (e.g., `https://ustapanelcutsrc-git-claude-36a702-...vercel.app`)
- Production: (to be configured once main is merged)

### No Pre-commit Hooks Currently
If you want to add husky (enforce tests/lint before commit):
```bash
npm install husky --save-dev
npx husky install
npx husky add .husky/pre-commit "npm run typecheck && npm run test"
```

---

## Troubleshooting

### Issue: "Types not found" when running tests
**Solution**: Run `npm run typecheck` first; may reveal missing types in `src/domain/types.ts`

### Issue: "Vercel build fails: VITE_GOOGLE_CLIENT_ID not set"
**Solution**: Either set it in Vercel env vars, or check if code is gated behind `import.meta.env.VITE_GOOGLE_CLIENT_ID` properly

### Issue: 3D model doesn't render
**Solution**: Check `Building3D.tsx` canvas ref, ensure Three.js is loaded, check browser console for WebGL errors

### Issue: Cascade calculation returns partial results (ok=false for one step)
**Expected**: This is intentional. If purlin selection fails, warning is shown, but system doesn't halt (shows empty result for that step)

### Issue: "Завод БИАСТ" still shows in personal cabinet after migration
**Solution**: Check `src/auth/authStore.ts::persisted()` — migration only runs on load from localStorage; if user already logged in before migration, need to re-authenticate

---

## Next Steps for New Team

### Priority 1: PDF Export (Highest)
- [ ] Finalize 9-sheet structure (cover, general, axes, frame, facades, roof, specs, estimate, notes)
- [ ] Decide: jsPDF + html2canvas? or SVG-to-PDF?
- [ ] Implement `src/export/pdf.ts`
- [ ] Add "Скачать PDF" button
- [ ] Test: output has correct ГОСТ 2.104 stamp (185×55 mm in bottom-right of each sheet)

### Priority 2: Expand Catalogs
- [ ] Review actual purlin/column/foundation vendor specs
- [ ] Add more profiles to PURLIN_PROFILES, COLUMN_SECTIONS if needed
- [ ] Validate against укрупнённая таблица (roughhewn design table)

### Priority 3: Validation & Warnings
- [ ] Add more structural checks (rebar min %, concrete strength per region)
- [ ] Add seismic factor (КР 8–9 balloons)
- [ ] Improve warning messages (currently generic)

### Priority 4: 3D CAD Export
- [ ] Integrate DXF or STEP export (sketch for CAD)
- [ ] Coordinate with SketchUp if that's the design tool

### Priority 5: Analytics & Telemetry
- [ ] Track user workflows (which cascade step fails most often?)
- [ ] Collect feedback on whether results match manual design

---

## Contact & Questions

For questions about the code:
1. Check `README.md` (full architecture)
2. Check `HANDOFF.md` (this file)
3. Search `src/tests/structural.test.ts` for examples
4. Look at Git history: `git log --oneline` (commits have descriptive messages in Russian)

**Key commits to understand**:
- `045f271`: "Конкретный подбор колонны/фундамента, вариативность выборок, каркас в 3D"
- `5341ffc`: "Авторизация Gmail, личный кабинет и лист «2. Конструкции»"

---

## Summary

You now have:
- ✅ Full working cascade logic (purlin → truss → column → foundation)
- ✅ Variability modes (auto-pick vs manual)
- ✅ 43 passing tests
- ✅ 3D visualization
- ✅ Google OAuth integration
- ❌ PDF export (to be done)

The code is well-structured and ready for the next team to extend. Start with PDF export (high ROI), then expand catalogs and add seismic checks.

**Deploy strategy**: Push to `claude/construction-page-gmail-auth-t7gldb`, Vercel preview auto-updates, merge to main when ready for production.

Good luck! 🚀
