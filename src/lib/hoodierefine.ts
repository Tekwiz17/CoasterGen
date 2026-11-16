/** Split color-boundary triangles with shared midpoints; never move the surface. */
export function refineColorEdges(points:number[][], faces:number[][], slots:Uint8Array, limit=1800000, sample?: (point:number[])=>number, precision=8, minEdge=0) {
  const first=new Int16Array(points.length).fill(-1), boundary=new Uint8Array(points.length);
  faces.forEach((f,i)=>{for(const v of f){if(first[v]<0)first[v]=slots[i];else if(first[v]!==slots[i])boundary[v]=1;}});
  const edges=new Map<string,number>();
  const key=(a:number,b:number)=>a<b?a+":"+b:b+":"+a;
  for(const f of faces) if(f.some(v=>boundary[v]) && f.some((v,j)=>Math.hypot(...points[v].map((n,k)=>n-points[f[(j+1)%3]][k]))>minEdge)) for(let j=0;j<3;j++)edges.set(key(f[j],f[(j+1)%3]),-1);
  if(!edges.size)return {points,faces};
  let count=0;
  for(const f of faces){let n=0;for(let j=0;j<3;j++)if(edges.has(key(f[j],f[(j+1)%3])))n++;count+=1+n;}
  if(count>limit){
    // Refine the largest boundary edges first when the browser budget is tight.
    // Shared edge accounting keeps neighboring triangles conforming.
    const incidence=new Map<string,number>();
    for(const f of faces)for(let j=0;j<3;j++){const k=key(f[j],f[(j+1)%3]);if(edges.has(k))incidence.set(k,(incidence.get(k)||0)+1);}
    const length=(k:string)=>{const [a,b]=k.split(":").map(Number);return points[a].reduce((s,v,j)=>s+(v-points[b][j])**2,0);};
    const ordered=[...edges.keys()].map(k=>({k,length:length(k)})).sort((a,b)=>b.length-a.length);
    edges.clear();let budget=limit-faces.length;
    for(const {k} of ordered){const cost=incidence.get(k)!;if(cost<=budget){edges.set(k,-1);budget-=cost;}}
    if(!edges.size)return {points,faces};
  }
  const output=points.slice(), triangles:number[][]=[];
  const midpoint=(a:number,b:number)=>{const k=key(a,b);let i=edges.get(k)!;if(i<0){i=output.length;let t=.5;
      if(sample && sample(points[a])!==sample(points[b])){
        const first=sample(points[a]);let lo=0,hi=1;
        for(let step=0;step<precision;step++){const mid=(lo+hi)/2;const p=points[a].map((v,j)=>v+(points[b][j]-v)*mid);if(sample(p)===first)lo=mid;else hi=mid;}
        t=Math.max(.02,Math.min(.98,(lo+hi)/2));
      }
      output.push(points[a].map((v,j)=>v+(points[b][j]-v)*t));edges.set(k,i);}return i;};
  for(const f of faces){
    const split=f.map((v,j)=>edges.has(key(v,f[(j+1)%3])));
    const n=split.filter(Boolean).length;
    if(!n){triangles.push(f);continue;}
    if(n===3){const [a,b,c]=f,ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);triangles.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);continue;}
    const j=n===1?split.indexOf(true):(split.indexOf(false)+1)%3;
    const a=f[j],b=f[(j+1)%3],c=f[(j+2)%3],ab=midpoint(a,b);
    if(n===1)triangles.push([a,ab,c],[ab,b,c]);
    else {const bc=midpoint(b,c);triangles.push([b,bc,ab],[a,ab,c],[ab,bc,c]);}
  }
  return {points:output,faces:triangles};
}
