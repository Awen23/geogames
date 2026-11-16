import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Sphere,
  Graticule,
  useMapContext,
} from 'react-simple-maps';
import type { Tier } from '@shared/types';
import type { GeoPermissibleObjects } from 'd3-geo';
import centroids from '@shared/centroids.json';
import styles from './Globe.module.css';
import { numericToIso3 } from '../../lib/iso3Lookup';
import { pointerToLatLon } from '../../lib/globeCoords';

const GEO_URL = '/world-50m.json';
const WIDTH = 650;
const HEIGHT = 650;
const BASE_SCALE = 290;
const MIN_SCALE = 200;
const MAX_SCALE = 1800;
const BASE_ROTATION_SENSITIVITY = 0.4;

const CENTROID_MAP = centroids as Record<string, { lat: number; lon: number }>;

export interface PlacedCountryData {
  iso3: string;
  lat: number;
  lon: number;
  label: string;
}

export interface GlobeProps {
  onCountryClick: (iso3: string) => void;
  highlight?: Record<string, Tier>;
  /** Arrow from the guessed country pointing in the direction of the answer */
  arrow?: { fromIso3: string; bearingDeg: number };
  disabled?: boolean;
  /** GeoPlace: ghost country shape follows cursor */
  ghostIso3?: string;
  /**
   * GeoPlace placement UX.
   * - immediate: ghost follows pointer; click commits (desktop).
   * - confirm: tap to position, drag to adjust, parent confirms via tick/cross (mobile).
   */
  placementMode?: 'immediate' | 'confirm';
  /** GeoPlace confirm mode: draft position shown as a draggable ghost */
  pendingPlace?: { lat: number; lon: number };
  /** GeoPlace confirm mode: tap or drag updates the draft position */
  onPendingPlace?: (lat: number, lon: number) => void;
  /** GeoPlace immediate mode: called on click with the lat/lon under the cursor */
  onPlace?: (lat: number, lon: number) => void;
  /** GeoPlace: frozen placed shapes accumulated across rounds */
  placedCountries?: PlacedCountryData[];
  /** GeoPlace: shown at end reveal — highlights correct country positions */
  revealIso3s?: string[];
  /** GeoPlace: always-on reference country highlight */
  referenceIso3?: string;
  /** Override the initial globe rotation — [-lon, -lat] centres on that point */
  initialRotation?: [number, number];
  /** When true, renders all regular countries as ocean colour — only reference/placed/revealed countries are visible */
  blankGlobe?: boolean;
  /** Heatmap colouring — ISO3 → CSS colour string. Takes precedence over tier highlight. */
  heatmap?: Record<string, string>;
}

const TIER_COLOUR: Record<Tier, string> = {
  found: 'var(--colour-bullseye)',
  warm: 'var(--colour-top15)',
  cold: 'var(--colour-cold)',
  'no-data': 'var(--colour-border)',
};

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;
const ARROW_ARC_DEG = 22;

function destPoint(lon0: number, lat0: number, bearing: number, arcDeg: number): [number, number] {
  const d = arcDeg * TO_RAD;
  const b = bearing * TO_RAD;
  const lat1 = lat0 * TO_RAD;
  const lon1 = lon0 * TO_RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [lon2 * TO_DEG, lat2 * TO_DEG];
}

function HintArrow({ fromIso3, bearingDeg }: { fromIso3: string; bearingDeg: number }) {
  const { projection } = useMapContext();
  const fromData = CENTROID_MAP[fromIso3];

  if (!fromData || !projection) { return null; }

  const fromPt = projection([fromData.lon, fromData.lat]);
  if (!fromPt || isNaN(fromPt[0])) { return null; }

  const [toLon, toLat] = destPoint(fromData.lon, fromData.lat, bearingDeg, ARROW_ARC_DEG);
  const toPt = projection([toLon, toLat]);
  if (!toPt || isNaN(toPt[0])) { return null; }

  return (
    <g>
      <defs>
        <marker
          id="globe-arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.9)" />
        </marker>
      </defs>
      <line
        x1={fromPt[0]}
        y1={fromPt[1]}
        x2={toPt[0]}
        y2={toPt[1]}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={2}
        strokeDasharray="6 3"
        markerEnd="url(#globe-arrowhead)"
        className={styles.arrow}
      />
    </g>
  );
}

/** Ghost country shape that follows the mouse cursor */
function GhostCountry({
  geo,
  iso3,
  mouseSvgPos,
}: {
  geo: GeoPermissibleObjects;
  iso3: string;
  mouseSvgPos: [number, number];
}) {
  const { projection } = useMapContext();
  const centroidData = CENTROID_MAP[iso3];
  if (!centroidData || !projection) { return null; }

  const centroidPt = projection([centroidData.lon, centroidData.lat]);
  if (!centroidPt || isNaN(centroidPt[0])) { return null; }

  const [cx, cy] = centroidPt;
  const [mx, my] = mouseSvgPos;

  return (
    <g
      transform={`translate(${mx - cx}, ${my - cy})`}
      style={{ pointerEvents: 'none' }}
    >
      <Geography
        geography={geo}
        fill="var(--colour-ghost)"
        stroke="var(--colour-ghost-stroke)"
        strokeWidth={1}
        style={{
          default: { outline: 'none' },
          hover: { outline: 'none' },
          pressed: { outline: 'none' },
        }}
      />
    </g>
  );
}

/** Ghost at a fixed lat/lon — draggable on touch/coarse-pointer layouts */
function DraggableGhostCountry({
  geo,
  iso3,
  lat,
  lon,
  onMove,
  suppressPlaceClickRef,
}: {
  geo: GeoPermissibleObjects;
  iso3: string;
  lat: number;
  lon: number;
  onMove: (lat: number, lon: number) => void;
  /** Consumed by the next place click after an outline drag ends */
  suppressPlaceClickRef: React.RefObject<boolean>;
}) {
  const { projection } = useMapContext();
  const groupRef = useRef<SVGGElement>(null);
  const outlineDraggedRef = useRef(false);

  const moveFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = groupRef.current?.ownerSVGElement;
      if (!svg) { return; }
      const pos = pointerToLatLon(svg, clientX, clientY, projection, WIDTH, HEIGHT);
      if (pos) {
        onMove(pos.lat, pos.lon);
      }
    },
    [onMove, projection],
  );

  const releasePointer = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (outlineDraggedRef.current) {
      suppressPlaceClickRef.current = true;
      outlineDraggedRef.current = false;
    }
  }, [suppressPlaceClickRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      e.stopPropagation();
      outlineDraggedRef.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) { return; }
      outlineDraggedRef.current = true;
      moveFromPointer(e.clientX, e.clientY);
    },
    [moveFromPointer],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<SVGGElement>) => {
    e.stopPropagation();
  }, []);

  // Early returns must come after all hooks (Rules of Hooks).
  const centroidData = CENTROID_MAP[iso3];
  if (!centroidData || !projection) { return null; }

  const centroidPt = projection([centroidData.lon, centroidData.lat]);
  if (!centroidPt || isNaN(centroidPt[0])) { return null; }

  const placedPt = projection([lon, lat]);
  if (!placedPt || isNaN(placedPt[0])) { return null; }

  const [cx, cy] = centroidPt;
  const [px, py] = placedPt;

  return (
    <g
      ref={groupRef}
      data-testid="draggable-ghost-country"
      transform={`translate(${px - cx}, ${py - cy})`}
      style={{ cursor: 'grab', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <Geography
        geography={geo}
        fill="var(--colour-ghost)"
        stroke="var(--colour-ghost-stroke)"
        strokeWidth={1}
        style={{
          default: { outline: 'none' },
          hover: { outline: 'none' },
          pressed: { outline: 'none' },
        }}
      />
    </g>
  );
}

/** Frozen placed country shape rendered at the player's clicked position */
function PlacedCountry({
  geo,
  iso3,
  lat,
  lon,
  label,
}: PlacedCountryData & { geo: GeoPermissibleObjects }) {
  const { projection } = useMapContext();
  const centroidData = CENTROID_MAP[iso3];
  if (!centroidData || !projection) { return null; }

  const centroidPt = projection([centroidData.lon, centroidData.lat]);
  if (!centroidPt || isNaN(centroidPt[0])) { return null; }

  const placedPt = projection([lon, lat]);
  if (!placedPt || isNaN(placedPt[0])) { return null; }

  const [cx, cy] = centroidPt;
  const [px, py] = placedPt;

  const showArrow = parseInt(label) < 98;

  return (
    <>
      <g
        transform={`translate(${px - cx}, ${py - cy})`}
        style={{ pointerEvents: 'none' }}
      >
        <Geography
          geography={geo}
          fill="var(--colour-geoplace-placed)"
          stroke="var(--colour-ghost-stroke)"
          strokeWidth={1}
          style={{
            default: { outline: 'none' },
            hover: { outline: 'none' },
            pressed: { outline: 'none' },
          }}
        />
        {/* Score label above the placed centroid */}
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          dominantBaseline="auto"
          fill="white"
          fontSize={13}
          fontWeight="bold"
          stroke="rgba(0,0,0,0.8)"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
      </g>
      {showArrow && (
        <g style={{ pointerEvents: 'none' }}>
          <defs>
            <marker
              id={`placed-arrow-${iso3}`}
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.9)" />
            </marker>
          </defs>
          <line
            x1={px}
            y1={py}
            x2={cx}
            y2={cy}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={2}
            strokeDasharray="6 3"
            markerEnd={`url(#placed-arrow-${iso3})`}
          />
        </g>
      )}
    </>
  );
}

/**
 * Transparent SVG rect that sits on top of all geography elements.
 * Captures clicks (and touch taps via React's synthetic onClick) and converts
 * them to lat/lon via projection.invert.
 */
function PlaceClickTarget({
  onPosition,
  didDragRef,
  suppressPlaceClickRef,
}: {
  onPosition: (lat: number, lon: number) => void;
  didDragRef: React.RefObject<boolean>;
  suppressPlaceClickRef: React.RefObject<boolean>;
}) {
  const { projection } = useMapContext();

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (didDragRef.current) { return; }
      if (suppressPlaceClickRef.current) {
        suppressPlaceClickRef.current = false;
        return;
      }
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg || !projection) { return; }
      const pos = pointerToLatLon(svg, e.clientX, e.clientY, projection, WIDTH, HEIGHT);
      if (!pos) { return; }
      onPosition(pos.lat, pos.lon);
    },
    [onPosition, didDragRef, suppressPlaceClickRef, projection],
  );

  return (
    <rect
      x={0}
      y={0}
      width={WIDTH}
      height={HEIGHT}
      fill="transparent"
      style={{ cursor: 'crosshair' }}
      onClick={handleClick}
      data-testid="globe-place-target"
    />
  );
}

export function Globe({
  onCountryClick,
  highlight = {},
  arrow,
  disabled = false,
  ghostIso3,
  placementMode = 'immediate',
  pendingPlace,
  onPendingPlace,
  onPlace,
  placedCountries,
  revealIso3s,
  referenceIso3,
  initialRotation,
  blankGlobe = false,
  heatmap,
}: GlobeProps) {
  const [rotation, setRotation] = useState<[number, number]>(initialRotation ?? [0, -30]);
  const [scale, setScale] = useState(BASE_SCALE);
  const [mouseSvgPos, setMouseSvgPos] = useState<[number, number] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number] } | null>(null);
  const didDragRef = useRef(false);
  const suppressPlaceClickRef = useRef(false);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    suppressPlaceClickRef.current = false;
  }, [pendingPlace?.lat, pendingPlace?.lon, ghostIso3]);

  const isConfirmPlacement = placementMode === 'confirm' && Boolean(onPendingPlace);
  const showCursorGhost = Boolean(ghostIso3) && placementMode === 'immediate';
  const placeHandler = isConfirmPlacement ? onPendingPlace : onPlace;
  const showPlaceTarget = Boolean(placeHandler);

  // Non-passive wheel listener so we can preventDefault and prevent page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) { return; }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      setScale((prev) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Non-passive touchmove to prevent scroll while dragging/pinching the globe
  useEffect(() => {
    const el = containerRef.current;
    if (!el) { return; }
    const onTouchMove = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const rotationSensitivity = BASE_ROTATION_SENSITIVITY * BASE_SCALE / scale;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      dragRef.current = { x: e.clientX, y: e.clientY, rotation: [...rotation] as [number, number] };
      didDragRef.current = false;
    },
    [rotation],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragRef.current) { return; }
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { didDragRef.current = true; }
      setRotation([
        dragRef.current.rotation[0] + dx * rotationSensitivity,
        dragRef.current.rotation[1] - dy * rotationSensitivity,
      ]);
    },
    [rotationSensitivity],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  /** Tracks mouse position in SVG coordinate space for ghost shape rendering */
  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!showCursorGhost) { return; }
      const el = containerRef.current;
      if (!el) { return; }
      const svg = el.querySelector('svg');
      if (!svg) { return; }
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
      const svgY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
      setMouseSvgPos([svgX, svgY]);
    },
    [showCursorGhost],
  );

  const handleContainerMouseLeave = useCallback(() => {
    if (!showCursorGhost) { return; }
    setMouseSvgPos(null);
  }, [showCursorGhost]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { x: t.clientX, y: t.clientY, rotation: [...rotation] as [number, number] };
        didDragRef.current = false;
        pinchRef.current = null;
      } else if (e.touches.length === 2) {
        dragRef.current = null;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), scale };
      }
    },
    [rotation, scale],
  );

  const handleTouchMoveState = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && dragRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - dragRef.current.x;
        const dy = t.clientY - dragRef.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { didDragRef.current = true; }
        setRotation([
          dragRef.current.rotation[0] + dx * rotationSensitivity,
          dragRef.current.rotation[1] - dy * rotationSensitivity,
        ]);
      } else if (e.touches.length === 2 && pinchRef.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setScale(
          Math.max(MIN_SCALE, Math.min(MAX_SCALE, (pinchRef.current.scale * dist) / pinchRef.current.dist)),
        );
      }
    },
    [rotationSensitivity],
  );

  const handleTouchEnd = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
  }, []);

  const handleCountryClick = useCallback(
    (iso3: string) => {
      // In placement mode country clicks are handled by PlaceClickTarget
      if (disabled || didDragRef.current || showPlaceTarget) { return; }
      onCountryClick(iso3);
    },
    [disabled, onCountryClick, showPlaceTarget],
  );

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX_SCALE, s * 1.4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(MIN_SCALE, s / 1.4)), []);
  const zoomReset = useCallback(() => setScale(BASE_SCALE), []);

  return (
    <div
      className={styles.container}
      data-testid="globe"
      ref={containerRef}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMoveState}
      onTouchEnd={handleTouchEnd}
    >
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ scale, rotate: [rotation[0], rotation[1], 0] }}
        width={WIDTH}
        height={HEIGHT}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Sphere
          id="globe-sphere"
          fill="var(--colour-globe-ocean)"
          stroke="var(--colour-globe-border)"
          strokeWidth={0.5}
        />
        <Graticule stroke="var(--colour-globe-border)" strokeWidth={0.3} />
        <Geographies geography={GEO_URL}>
          {({ geographies }) => {
            // Build an iso3 → geo lookup for ghost and placed shapes
            const geoByIso3 = new Map<string, GeoPermissibleObjects>();
            for (const geo of geographies) {
              const iso3 = numericToIso3[String(geo.id).padStart(3, '0')];
              if (iso3) { geoByIso3.set(iso3, geo as unknown as GeoPermissibleObjects); }
            }

            return (
              <>
                {/* Base country fill layer */}
                {geographies.map((geo) => {
                  const iso3 = numericToIso3[String(geo.id).padStart(3, '0')];
                  const isRevealed = iso3 ? (revealIso3s?.includes(iso3) ?? false) : false;
                  const isReference = iso3 === referenceIso3;
                  const isSpecial = isRevealed || isReference;
                  const tier = iso3 ? highlight[iso3] : undefined;

                  // In blank-globe mode, skip all ordinary countries entirely so no SVG paths
                  // (even transparent paths) cause visible artefacts on the empty globe
                  if (blankGlobe && !isSpecial && !tier) { return null; }

                  const heatmapColour = iso3 ? heatmap?.[iso3] : undefined;

                  let fill: string;
                  if (heatmapColour) {
                    fill = heatmapColour;
                  } else if (isRevealed) {
                    fill = 'var(--colour-geoplace-reveal)';
                  } else if (isReference) {
                    fill = 'var(--colour-reference)';
                  } else if (tier) {
                    fill = TIER_COLOUR[tier];
                  } else {
                    fill = 'var(--colour-globe-land)';
                  }

                  const hoverFill = showPlaceTarget
                    ? fill
                    : disabled
                      ? fill
                      : 'var(--colour-accent)';

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo as unknown as GeoPermissibleObjects}
                      fill={fill}
                      stroke="var(--colour-globe-border)"
                      strokeWidth={0.4}
                      onClick={() => iso3 && handleCountryClick(iso3)}
                      style={{
                        default: { outline: 'none' },
                        hover: {
                          outline: 'none',
                          fill: hoverFill,
                          cursor: showPlaceTarget ? 'crosshair' : disabled ? 'default' : 'pointer',
                        },
                        pressed: { outline: 'none' },
                      }}
                    />
                  );
                })}

                {/* Ghost shape following cursor (desktop immediate mode) */}
                {showCursorGhost && ghostIso3 && mouseSvgPos && geoByIso3.get(ghostIso3) && (
                  <GhostCountry
                    geo={geoByIso3.get(ghostIso3)!}
                    iso3={ghostIso3}
                    mouseSvgPos={mouseSvgPos}
                  />
                )}

                {/* Frozen placed shapes from previous rounds */}
                {placedCountries?.map((p) => {
                  const geo = geoByIso3.get(p.iso3);
                  return geo ? (
                    <PlacedCountry key={`placed-${p.iso3}`} geo={geo} {...p} />
                  ) : null;
                })}

                {/* Tap target for placement — below draggable ghost so ghost receives drags */}
                {showPlaceTarget && placeHandler && (
                  <PlaceClickTarget
                    onPosition={placeHandler}
                    didDragRef={didDragRef}
                    suppressPlaceClickRef={suppressPlaceClickRef}
                  />
                )}

                {/* Draft ghost for confirm placement (mobile) */}
                {isConfirmPlacement && ghostIso3 && pendingPlace && geoByIso3.get(ghostIso3) && (
                  <DraggableGhostCountry
                    geo={geoByIso3.get(ghostIso3)!}
                    iso3={ghostIso3}
                    lat={pendingPlace.lat}
                    lon={pendingPlace.lon}
                    onMove={onPendingPlace!}
                    suppressPlaceClickRef={suppressPlaceClickRef}
                  />
                )}
              </>
            );
          }}
        </Geographies>
        {arrow && <HintArrow fromIso3={arrow.fromIso3} bearingDeg={arrow.bearingDeg} />}
      </ComposableMap>

      <div className={styles.zoomControls}>
        <button className={styles.zoomBtn} onClick={zoomIn} aria-label="Zoom in">+</button>
        <button className={styles.zoomBtn} onClick={zoomReset} aria-label="Reset zoom" title="Reset">⊙</button>
        <button className={styles.zoomBtn} onClick={zoomOut} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
