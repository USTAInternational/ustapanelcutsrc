import type { Point2D } from '../domain/types';
export const GEOMETRY_EPSILON = 0.001;
export const polygonArea = (p: Point2D[]) => Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length]; return s+a.x*b.y-b.x*a.y},0))/2;
export const bounds = (p: Point2D[]) => ({minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minY:Math.min(...p.map(v=>v.y)),maxY:Math.max(...p.map(v=>v.y))});
type Axis='x'|'y';
function clipEdge(poly:Point2D[],axis:Axis,value:number,keepGreater:boolean):Point2D[]{const out:Point2D[]=[]; if(!poly.length)return out; const inside=(p:Point2D)=>(keepGreater?p[axis]>=value-GEOMETRY_EPSILON:p[axis]<=value+GEOMETRY_EPSILON); for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=inside(a),bi=inside(b); if(ai)out.push(a); if(ai!==bi){const d=b[axis]-a[axis]; const t=Math.abs(d)<GEOMETRY_EPSILON?0:(value-a[axis])/d; out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}} return out;}
export function clipPolygonByVerticalStrip(p:Point2D[],min:number,max:number){return clipEdge(clipEdge(p,'x',min,true),'x',max,false)}
export function clipPolygonByHorizontalStrip(p:Point2D[],min:number,max:number){return clipEdge(clipEdge(p,'y',min,true),'y',max,false)}
export function pointInPolygon(p:Point2D,poly:Point2D[]){let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j]; if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))inside=!inside;} return inside||poly.some((a,i)=>{const b=poly[(i+1)%poly.length]; const cross=(p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x); return Math.abs(cross)<GEOMETRY_EPSILON&&p.x>=Math.min(a.x,b.x)-GEOMETRY_EPSILON&&p.x<=Math.max(a.x,b.x)+GEOMETRY_EPSILON&&p.y>=Math.min(a.y,b.y)-GEOMETRY_EPSILON&&p.y<=Math.max(a.y,b.y)+GEOMETRY_EPSILON})}
