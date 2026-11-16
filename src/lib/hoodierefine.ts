/** Split color-boundary triangles with shared midpoints; never move the surface. */
export function refineColorEdges(points:number[][], faces:number[][], slots:Uint8Array, limit=1800000) {
  const first=new Int16Array(points.length).fill(-1), boundary=new Uint8Array(points.length);
  faces.forEach((f,i)=>{for(const v of f){if(first[v]<0)first[v]=slots[i];else if(first[v]!==slots[i])boundary[v]=1;}});
  const edges=new Map<string,number>();
  const key=(a:number,b:number)=>a<b?a+":"+b:b+":"+a;
  for(const f of faces) if(f.some(v=>boundary[v])) for(let j=0;j<3;j++)edges.set(key(f[j],f[(j+1)%3]),-1);
  if(!edges.size)return {points,faces};
  let count=0;
  for(const f of faces){let n=0;for(let j=0;j<3;j++)if(edges.has(key(f[j],f[(j+1)%3])))n++;count+=1+n;}
  if(count>limit)throw new RangeError("Beta edge refinement reached its detail limit. Reduce image detail or turn off Smooth color edges (beta).");
  const output=points.slice(), triangles:number[][]=[];
  const midpoint=(a:number,b:number)=>{const k=key(a,b);let i=edges.get(k)!;if(i<0){i=output.length;output.push(points[a].map((v,j)=>(v+points[b][j])/2));edges.set(k,i);}return i;};
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
