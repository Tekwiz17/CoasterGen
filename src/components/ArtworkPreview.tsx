import type { Artwork } from "../types";
export default function ArtworkPreview({artwork:a,colors,mapping}:{artwork:Artwork;colors:string[];mapping:number[]}) {
  const path=(loops:number[][][])=>loops.map(loop=>loop.map(([x,y],i)=>`${i?"L":"M"}${x},${y}`).join(" ")+"Z").join(" ");
  return <svg role="img" aria-label="Hoodie artwork preview" viewBox={`0 0 ${a.width} ${a.height}`} style={{width:"100%",height:"100%",minHeight:180,maxHeight:420}}>
    <rect width={a.width} height={a.height} fill={colors[0]}/>
    {a.loops.map((loops,i)=><path key={i} d={path(loops)} fill={colors[mapping[i]??i]} fillRule="evenodd"/>)}
    {a.paintLoops?.map((loops,i)=><path key={"paint"+i} d={path(loops)} fill={colors[i]} fillRule="evenodd"/>)}
  </svg>;
}
