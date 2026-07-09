# USTA BIM — Handoff Summary for Codex Team

**Date**: 2026-07-09  
**Status**: Ready for handoff  
**Current Deploy**: Vercel (PR #1, draft)

---

## What You're Getting

A fully functional **sandwich-panel structural calculator** for buildings in Kyrgyzstan. The app:
1. Accepts building geometry (plan, walls, roof type)
2. Lets users layout wall and roof panels + openings (windows/doors)
3. **Auto-calculates structural frame** in a cascade:
   - Selects purlin (швеллер/двутавр) by checking stress & deflection
   - Designs truss (height rule L/7…L/6, calculates chord forces)
   - Picks column (by load + height, checks slenderness λ ≤ 140)
   - Sizes foundation (strip or pad, calculates bearing area)
4. Shows **3D visualization** of the complete frame + panels
5. Supports **manual overrides** (user can pick specific sections, system validates)

**Technology**: React 19 + TypeScript + Vite + Three.js + Zustand + Vitest  
**Tests**: 43 passing, all cascade logic verified  
**Deployment**: Vercel (auto-deploys from PR/main)

---

## What's Done ✅

- [x] Core cascade calculation (4-step cascade: purlin → truss → column → foundation)
- [x] All 8 Kyrgyzstan regions with snow/wind/soil/transport auto-fill
- [x] Variability modes: auto-pick (first passing) OR manual section selection
- [x] Google OAuth integration (demo mode works without setup)
- [x] User profile (personal cabinet: name, role, phone, factory)
- [x] 3D rendering with toggle: All / Panels / Frame
- [x] Full test coverage (43 tests, Vitest)
- [x] Production-ready Vercel deployment
- [x] Comprehensive documentation (README.md + HANDOFF.md)

---

## What's NOT Done ❌

- [ ] **PDF Export** (эскизный проект, 9 sheets A3 in ГОСТ format) — awaiting sign-off on structure

---

## Quick Start for Codex

```bash
git clone https://github.com/ustainternational/ustapanelcutsrc.git
cd ustapanelcutsrc
git checkout claude/construction-page-gmail-auth-t7gldb

npm install
npm run dev
```

Visit http://localhost:5173

**To deploy**: Push to `claude/construction-page-gmail-auth-t7gldb` → Vercel auto-updates PR preview → merge to main when ready

---

## Three Key Documents to Read

### 1. **README.md** (full architecture)
- Project overview
- Module descriptions
- Cascade mechanism (how loads flow top-down)
- Variability modes (auto vs manual)
- 3D system
- Testing
- Deployment

### 2. **HANDOFF.md** (step-by-step guide)
- Quick-start commands
- File structure with explanations
- Deep-dive into `structural.ts` (the cascade heart)
- State management patterns
- Common tasks (add region, add profile, implement PDF)
- Troubleshooting

### 3. **src/tests/structural.test.ts** (examples)
- 43 tests showing all scenarios
- Reference for how cascade should work
- Examples of both auto and manual modes

---

## Next Priority: PDF Export

The ONLY blocking feature is PDF export. Structure TBD, but likely:
1. **Cover sheet** — 3D + project title
2. **General data** — object, building, customer, manager
3. **Axes plan** — column layout, foundation type
4. **Frame scheme** — purlin, truss, column sections with dimensions
5. **Facades** — panel layout, openings
6. **Roof** — panels, openings, slope
7. **Specifications** — materials, sections, quantities
8. **Estimate** (optional)
9. **Notes** (optional)

Each sheet: A3 (420×297 mm), ГОСТ 2.104 stamp (185×55 mm) in bottom-right.

**To implement**: Add `src/export/pdf.ts` using jsPDF + html2canvas, wire up "Скачать PDF" button.

---

## What Each File Does

**Core Calculation**:
- `src/calculation/structural.ts` — purlin/truss/column/foundation selection logic
- `src/domain/regions.ts` — KG regions catalog
- `src/domain/types.ts` — TypeScript interfaces

**State**:
- `src/store/projectStore.ts` — Zustand store + localStorage

**UI**:
- `src/components/StructuralTab.tsx` — the cascade results display
- `src/components/Building3D.tsx` — Three.js 3D view
- `src/components/Forms.tsx` — input forms for all tabs

**Tests**:
- `src/tests/structural.test.ts` — 43 tests, your reference

---

## Git Workflow

**Working branch**: `claude/construction-page-gmail-auth-t7gldb`  
**Default branch**: `main` (once PR is merged)

```bash
# Make changes
git add .
git commit -m "Feature: ..."
git push origin claude/construction-page-gmail-auth-t7gldb

# Vercel auto-deploys PR preview
# When ready, merge PR → main → Vercel auto-deploys production
```

---

## Key Commit History

```
c99a680 Handoff documentation: README + HANDOFF.md
fa9a684 Build artifact update (tsbuildinfo)
045f271 Concrete column/foundation selection, variability, 3D frame
5341ffc Google OAuth, personal cabinet, structural cascade
a6f9d69 Initial project
```

---

## Testing

```bash
npm run test          # Vitest (43 tests)
npm run typecheck     # TypeScript strict mode
npm run build         # Vite production build
```

All tests passing, TypeScript strict.

---

## Deployment (Vercel)

- **Preview**: Auto-deployed from PR (updates on every push)
- **Production**: Merge PR to main (auto-deployed)
- **Env**: Set `VITE_GOOGLE_CLIENT_ID` in Vercel settings for real Google OAuth

---

## Questions?

1. **Architecture questions** → read README.md (sections 2–7)
2. **How-to questions** → read HANDOFF.md (section "Common Tasks")
3. **Code examples** → look at src/tests/structural.test.ts (43 test cases)
4. **Git history** → `git log` (commit messages in Russian, clearly describe changes)

---

## Success Criteria for Handoff

✅ Codex team can:
- [ ] Clone and run locally (`npm run dev`)
- [ ] Understand cascade flow (purlin → truss → column → foundation)
- [ ] Navigate the codebase (know where to add features)
- [ ] Run tests and understand what they verify
- [ ] Deploy to Vercel
- [ ] Implement PDF export as next feature

**You're ready when all above are checked.** 🚀

---

## Contact

All code is self-documenting via:
- Type hints (TypeScript strict)
- Function names (selectPurlin, selectTruss, etc.)
- Comments only where WHY is non-obvious
- Test cases as examples

The docs (README.md + HANDOFF.md) should answer 99% of questions. If stuck, check the test file — it covers every scenario.

**Good luck! The foundation is solid.** 💪
