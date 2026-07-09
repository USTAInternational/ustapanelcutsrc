import type { CalculationSettings, Opening, PanelPiece, Point2D, Surface } from '../domain/types';
import { bounds, clipPolygonByHorizontalStrip, clipPolygonByVerticalStrip, pointInPolygon, polygonArea } from './core';
const openingPoly=(o:Opening,clearance=0):Point2D[]=>[
  {x:o.x-clearance,y:o.y-clearance},
  {x:o.x+o.width+clearance,y:o.y-clearance},
  {x:o.x+o.width+clearance,y:o.y+o.height+clearance},
  {x:o.x-clearance,y:o.y+o.height+clearance},
];
export const openingIsValid=(o:Opening,s:Surface,clearance=0)=>openingPoly(o,clearance).every(p=>pointInPolygon(p,s.polygon))&&o.width>0&&o.height>0;
export function applyOpeningsToPanels(
  panels:PanelPiece[],
  openings:Opening[],
  settings:Pick<CalculationSettings,'subtractOpenings'|'openingClearanceMm'>
){return panels.map(panel=>{const clearance=settings.openingClearanceMm??0;const cuts=openings.filter(o=>o.surfaceId===panel.surfaceId).flatMap(o=>{const p=clipPolygonByHorizontalStrip(clipPolygonByVerticalStrip(panel.polygon,o.x-clearance,o.x+o.width+clearance),o.y-clearance,o.y+o.height+clearance);if(p.length<3||polygonArea(p)<=0)return[];const b=bounds(p);return[{openingId:o.id,polygon:p,localX:b.minX-panel.positionX,localY:b.minY-panel.positionY,width:b.maxX-b.minX,height:b.maxY-b.minY}]});const cutArea=cuts.reduce((s,c)=>s+polygonArea(c.polygon),0),visible=Math.max(0,panel.visibleArea-(settings.subtractOpenings?cutArea:0));return{...panel,cutouts:cuts,visibleArea:visible,wasteArea:Math.max(0,panel.blankArea-visible)}})}
