import {test} from "node:test";import assert from "node:assert/strict";import {refineColorEdges} from "../src/lib/hoodierefine";
test("beta refinement preserves closed shared edges and orientation",()=>{
const p=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],f=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]];
const r=refineColorEdges(p,f,new Uint8Array([0,1,0,0]));
assert.ok(r.faces.length>f.length);
const edges=new Map<string,number>();for(const f of r.faces)for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3],k=Math.min(a,b)+":"+Math.max(a,b);edges.set(k,(edges.get(k)||0)+1);}
assert.ok([...edges.values()].every(n=>n===2));
const vol=(p:number[][],f:number[][])=>f.reduce((sum,[a,b,c])=>sum+(p[a][0]*(p[b][1]*p[c][2]-p[b][2]*p[c][1])+p[a][1]*(p[b][2]*p[c][0]-p[b][0]*p[c][2])+p[a][2]*(p[b][0]*p[c][1]-p[b][1]*p[c][0]))/6,0);
assert.ok(Math.abs(vol(p,f)-vol(r.points,r.faces))<1e-12);
assert.ok(refineColorEdges(p,f,new Uint8Array([0,1,0,0]),5).faces.length<=5);
});
test("adaptive transitions preserve orientation and area without hanging vertices",()=>{
const points:number[][]=[],faces:number[][]=[];
for(let y=0;y<5;y++)for(let x=0;x<5;x++)points.push([x,y,0]);
for(let y=0;y<4;y++)for(let x=0;x<4;x++){const a=y*5+x;faces.push([a,a+1,a+6],[a,a+6,a+5]);}
const slots=new Uint8Array(faces.length);slots[0]=1;
const r=refineColorEdges(points,faces,slots);
let area=0;const edges=new Map<string,number>();
for(const [a,b,c] of r.faces){const p=r.points[a],q=r.points[b],s=r.points[c];const twice=(q[0]-p[0])*(s[1]-p[1])-(q[1]-p[1])*(s[0]-p[0]);assert.ok(twice>0);area+=twice/2;for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=Math.min(u,v)+":"+Math.max(u,v);edges.set(k,(edges.get(k)||0)+1);}}
assert.equal(area,16);
for(const [key,n] of edges){if(n===2)continue;assert.equal(n,1);const [a,b]=key.split(":").map(Number),p=r.points[a],q=r.points[b];assert.ok((p[0]===q[0]&&(p[0]===0||p[0]===4))||(p[1]===q[1]&&(p[1]===0||p[1]===4)));}
});

import {exportHoodie,loadHoodie,paintCode} from "../src/lib/hoodie";
import {strToU8,strFromU8,unzipSync} from "fflate";
test("refined 3MF exports matching paint, face metadata and original coordinates",()=>{
const points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],faces=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]];
const xml='<model><metadata>Hoodie Pen Pot</metadata><resources><object><mesh><vertices>'+points.map(p=>'<vertex x="'+(p[0]+10)+'" y="'+(p[1]+20)+'" z="'+(p[2]+30)+'"/>').join("")+'</vertices><triangles>'+faces.map(f=>'<triangle v1="'+f[0]+'" v2="'+f[1]+'" v3="'+f[2]+'"/>').join("")+'</triangles></mesh></object></resources></model>';
const key="3D/3dmodel.model",r=refineColorEdges(points,faces,new Uint8Array([0,1,0,0]));
const slots=Uint8Array.from(r.faces,(_,i)=>i%2);
const bytes=exportHoodie({xml,key,points:r.points,faces:r.faces,height:1,files:{[key]:strToU8(xml),"Metadata/project_settings.config":strToU8("{}"),"Metadata/model_settings.config":strToU8('<mesh_stat face_count="4"/>')}},slots,["#123456","#abcdef"]);
const files=unzipSync(bytes),out=strFromU8(files[key]);
assert.ok(out.includes('<vertex x="10" y="20" z="30"/>'));
assert.equal(loadHoodie(bytes).faces.length,r.faces.length);
assert.ok(strFromU8(files["Metadata/model_settings.config"]).includes('<mesh_stat face_count="'+r.faces.length+'"'));
assert.deepEqual([...out.matchAll(/paint_color="([^"]+)"/g)].map(m=>m[1]),Array.from(slots,s=>paintCode(s+1)));
});

test("refinement places shared vertices on a straight artwork boundary",()=>{
 const points=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],faces=[[0,1,2],[0,2,3]];
 const r=refineColorEdges(points,faces,new Uint8Array([1,0]),100,p=>p[0]>.3?1:0,14);
 assert.ok(r.points.some(p=>Math.abs(p[0]-.3)<.0001));
 for(const f of r.faces){const xs=f.map(i=>r.points[i][0]);assert.ok(Math.min(...xs)>=.2999||Math.max(...xs)<=.3001);}
});

test("budgeted refinement keeps shared edges closed",()=>{
 const p=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],f=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]];
 for(const limit of [6,8,10,12]){
  const r=refineColorEdges(p,f,new Uint8Array([0,1,0,0]),limit,v=>v[0]>.3?1:0,12);
  assert.ok(r.faces.length<=limit);
  const edges=new Map<string,number>();
  for(const face of r.faces)for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],k=Math.min(a,b)+":"+Math.max(a,b);edges.set(k,(edges.get(k)||0)+1);}
  assert.ok([...edges.values()].every(n=>n===2));
 }
});

test("3MF export rebuilds project references and rejects missing palettes",()=>{
 const points=[[0,0,0],[1,0,0],[0,1,0]], faces=[[0,1,2]], key="3D/3dmodel.model";
 const h={points,faces,height:1,key,xml:'<model><metadata name="License">Original license</metadata></model>',files:{
  "Metadata/project_settings.config":strToU8(JSON.stringify({filament_colour:["#ffffff"],filament_flow_ratio:["0.98"]})),
  "Metadata/plate_1.json":strToU8("stale"),"Metadata/model_settings.config":strToU8("stale")
 }};
 assert.throws(()=>exportHoodie(h,new Uint8Array([0]),[]),/filament color/);
 assert.throws(()=>exportHoodie(h,new Uint8Array([2]),["#ffffff"]),/out of date/);
 const files=unzipSync(exportHoodie(h,new Uint8Array([1]),["#ffffff","#123456"]));
 const settings=JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
 assert.deepEqual(settings.filament_colour,["#ffffff","#123456"]);
 assert.deepEqual(settings.filament_flow_ratio,["0.98","0.98"]);
 assert.equal(settings.flush_volumes_matrix.length,4);
 assert.ok(!files["Metadata/plate_1.json"]);
 assert.ok(strFromU8(files[key]).includes('name="License">Original license'));
 const cfg=strFromU8(files["Metadata/model_settings.config"]);
 assert.ok(cfg.includes('<part id="2"'));assert.ok(cfg.includes('key="object_id" value="2"'));
 assert.ok(!cfg.includes("thumbnail"));
});
