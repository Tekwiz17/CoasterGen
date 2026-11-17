import "./GenerationStatus.css";
export default function GenerationStatus({active,message}:{active:boolean;message:string}) {
  if(!active)return null;
  return <div className="generation-status" role="status" aria-live="polite" aria-atomic="true">
    <span className="generation-spinner" aria-hidden="true"/>
    <div><strong>{message||"Generating…"}</strong><small>Still working. Your result will appear when it’s ready.</small></div>
    <span className="generation-track" aria-hidden="true"><i/></span>
  </div>;
}
