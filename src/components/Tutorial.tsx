import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Magnet,
  Ruler,
} from "lucide-react";
import Modal from "./Modal";
import { BambuLogo } from "./BrandIcons";
import { SAMPLES, svgDataUrl } from "../samples";
const steps = [
  {
    title: "Make your first coaster",
    label: "Size",
    text: "Choose a shape and size. The default is 100 mm wide and 4 mm thick, with a flat top.",
    detail: "Start in Size. You can change these settings at any time.",
  },
  {
    title: "Add an image. Choose its colors.",
    label: "Image & colors",
    text: "Upload an image and preview it before applying. Four colors means one base color and three artwork colors.",
    detail:
      "Click a filament swatch to match your spool. Map image colors to combine regions or blend them into the base.",
  },
  {
    title: "Position it. Add magnets if you like.",
    label: "Adjust",
    text: "Drag your image in the top view. Use Center and the snap lines to line it up. Switch to 3D to inspect the result.",
    detail:
      "Magnets are optional. Choose a center pocket or several outer pockets, then enter your magnet dimensions.",
  },
  {
    title: "Download and print",
    label: "Print",
    text: "Download 3MF to keep the geometry and color assignments. Open the file in Bambu Studio or another compatible slicer.",
    detail:
      "Choose your printer, match the filament slots to your spools and check the sliced preview before printing.",
  },
];
export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = steps[step];
  return (
    <Modal title="Quick tutorial" onClose={onClose}>
      <div
        className="tutorial-progress"
        aria-label={"Tutorial step " + (step + 1) + " of 4"}
      >
        {steps.map((item, i) => (
          <button
            key={item.label}
            aria-label={"Tutorial: " + item.label}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
            className={i <= step ? "done" : ""}
          >
            <span>{i < step ? <Check size={12} /> : i + 1}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="tutorial-visual">
        <div className="tutorial-coaster">
          <img
            src={svgDataUrl(SAMPLES[0].svg)}
            alt="Example multicolor coaster"
          />
        </div>
        <div className="tutorial-callout">
          {step === 0 ? (
            <>
              <Ruler size={24} />
              <strong>100 × 4 mm</strong>
              <span>A useful starting size</span>
            </>
          ) : step === 1 ? (
            <>
              <ImagePlus size={24} />
              <div className="tutorial-swatches">
                {["#F2E9D8", "#DFAB49", "#D6603F", "#263D39"].map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </div>
              <span>1 base + 3 image colors</span>
            </>
          ) : step === 2 ? (
            <>
              <Magnet size={24} />
              <strong>Center & snap</strong>
              <span>Magnets are optional</span>
            </>
          ) : (
            <>
              <BambuLogo large />
              <strong>my-coaster.3mf</strong>
              <span>Colors included</span>
            </>
          )}
        </div>
      </div>
      <h3 className="tutorial-title">{s.title}</h3>
      <p className="modal-lead">{s.text}</p>
      <p className="tutorial-detail">{s.detail}</p>
      <div className="tutorial-actions">
        <button className="text-button" onClick={onClose}>
          Skip tutorial
        </button>
        <div>
          {step > 0 && (
            <button className="button light" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={15} />
              Back
            </button>
          )}
          <button
            className="button primary"
            onClick={() => (step === 3 ? onClose() : setStep(step + 1))}
          >
            {step === 3 ? "Start designing" : "Next"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
