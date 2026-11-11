import { useId, useMemo, useRef, useState } from "react";
import type { Artwork, Project } from "../types";
import {
  artContours,
  magnetCenters,
  outlines,
  pathData,
} from "../lib/geometry";
import { snapArtwork } from "../lib/alignment";
interface Props {
  project: Project;
  artwork: Artwork | null;
  bottom: boolean;
  zoom: number;
  onMove: (x: number, y: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}
export default function FlatPreview({
  project: p,
  artwork: art,
  bottom,
  zoom,
  onMove,
  onDragStart,
  onDragEnd,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const clipId = `art-${uid}`,
    shadowId = `shadow-${uid}`;
  const contours = useMemo(() => (art ? artContours(p, art) : []), [p, art]);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const svg = useRef<SVGSVGElement>(null);
  const r = p.diameter / 2,
    pad = p.diameter * 0.18;
  const [snap, setSnap] = useState<{ guideX?: number; guideY?: number }>({});
  const finish = () => {
    if (drag.current) onDragEnd();
    drag.current = null;
    setSnap({});
  };
  const mm = (x: number, y: number) => {
    const point = svg.current!.createSVGPoint();
    point.x = x;
    point.y = y;
    return point.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  return (
    <svg
      ref={svg}
      className={`flat-view ${bottom ? "bottom" : "draggable"}`}
      viewBox={`${-r - pad} ${-r - pad} ${p.diameter + pad * 2} ${p.diameter + pad * 2}`}
      role="img"
      aria-label={
        bottom
          ? "Underside view of magnet pockets"
          : "Top view. Drag artwork to position it."
      }
      onPointerDown={(e) => {
        if (bottom) return;
        onDragStart();
        const pt = mm(e.clientX, e.clientY);
        drag.current = {
          x: pt.x / zoom,
          y: pt.y / zoom,
          px: p.artX,
          py: p.artY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const pt = mm(e.clientX, e.clientY);
        let x = Math.max(
            -p.diameter,
            Math.min(
              p.diameter,
              drag.current.px + pt.x / zoom - drag.current.x,
            ),
          ),
          y = Math.max(
            -p.diameter,
            Math.min(
              p.diameter,
              drag.current.py - pt.y / zoom + drag.current.y,
            ),
          );
        if (p.snapEnabled && art && !e.altKey) {
          const result = snapArtwork(p, art, x, y, (p.diameter * 0.015) / zoom);
          x = result.x;
          y = result.y;
          setSnap(result);
        } else setSnap({});
        onMove(x, y);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={pathData(outlines(p, p.margin))} clipRule="evenodd" />
        </clipPath>
        <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="1.8"
            stdDeviation="1.8"
            floodColor="#303d33"
            floodOpacity=".12"
          />
        </filter>
      </defs>
      <g transform={`scale(${zoom})`}>
        <path
          d={pathData(outlines(p))}
          fillRule="evenodd"
          fill={p.colors[0]}
          stroke="#333333"
          strokeOpacity=".08"
          strokeWidth=".15"
          filter={`url(#${shadowId})`}
        />
        {!bottom && (
          <g clipPath={`url(#${clipId})`}>
            {contours.map((loops, i) =>
              (p.mapping[i] ?? i) === 0 ? null : (
                <path
                  key={i}
                  d={pathData(loops)}
                  fill={p.colors[p.mapping[i] ?? i]}
                  fillRule="evenodd"
                />
              ),
            )}
          </g>
        )}
        {!bottom && p.showGuides && (
          <g
            className="center-guides"
            fill="none"
            stroke="#8e9e89"
            strokeOpacity=".45"
            strokeWidth={p.diameter * 0.0015}
            strokeDasharray={`${p.diameter * 0.012} ${p.diameter * 0.014}`}
            pointerEvents="none"
          >
            <path d={`M${-r - 3},0H${r + 3}M0,${-r - 3}V${r + 3}`} />
            <circle r={p.diameter * 0.012} strokeDasharray="none" />
          </g>
        )}
        {!bottom && (
          <g
            className="snap-guides"
            fill="none"
            stroke="#e26f44"
            strokeWidth={p.diameter * 0.002}
            strokeDasharray={`${p.diameter * 0.015} ${p.diameter * 0.009}`}
            pointerEvents="none"
          >
            {snap.guideX !== undefined && (
              <path
                data-testid="snap-line-x"
                d={`M${snap.guideX},${-r - 5}V${r + 5}`}
              />
            )}{" "}
            {snap.guideY !== undefined && (
              <path
                data-testid="snap-line-y"
                d={`M${-r - 5},${-snap.guideY}H${r + 5}`}
              />
            )}
          </g>
        )}
        {bottom &&
          magnetCenters(p).map(([x, y], i) => (
            <g key={i}>
              <circle
                cx={x}
                cy={-y}
                r={(p.magnetDiameter + p.clearance) / 2}
                fill="#bfb9ae"
                stroke="#827d73"
                strokeWidth=".2"
              />
              <circle
                cx={x}
                cy={-y}
                r={(p.magnetDiameter + p.clearance) / 2 - 0.6}
                fill="#cfc8bb"
              />
              <path
                d={`M${x - 1},${-y}h2m-1,-1v2`}
                stroke="#827d73"
                strokeWidth=".2"
              />
            </g>
          ))}
      </g>
      {!bottom && (snap.guideX !== undefined || snap.guideY !== undefined) && (
        <text
          x="0"
          y={r + pad - 5}
          textAnchor="middle"
          fill="#cc754c"
          fontSize={p.diameter * 0.022}
          className="snap-label"
        >
          {snap.guideX === 0 && snap.guideY === 0
            ? "Centered"
            : snap.guideX === 0
              ? "Centered horizontally"
              : snap.guideY === 0
                ? "Centered vertically"
                : "Snapped to border"}
        </text>
      )}
    </svg>
  );
}
