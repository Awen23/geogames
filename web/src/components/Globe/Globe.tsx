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

const GEO_URL = '/world-50m.json';
const WIDTH = 650;
const HEIGHT = 650;
const BASE_SCALE = 290;
const MIN_SCALE = 200;
const MAX_SCALE = 1800;
const BASE_ROTATION_SENSITIVITY = 0.4;

export interface GlobeProps {
  onCountryClick: (iso3: string) => void;
  highlight?: Record<string, Tier>;
  /** Arrow from the guessed country pointing in the direction of the answer */
  arrow?: { fromIso3: string; bearingDeg: number };
  disabled?: boolean;
}

const TIER_COLOUR: Record<Tier, string> = {
  bullseye: 'var(--colour-bullseye)',
  top5: 'var(--colour-top5)',
  top15: 'var(--colour-top15)',
  cold: 'var(--colour-cold)',
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
  const fromData = (centroids as Record<string, { lat: number; lon: number }>)[fromIso3];

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

export function Globe({ onCountryClick, highlight = {}, arrow, disabled = false }: GlobeProps) {
  const [rotation, setRotation] = useState<[number, number]>([0, -30]);
  const [scale, setScale] = useState(BASE_SCALE);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number] } | null>(null);
  const didDragRef = useRef(false);
  // Stores state at the start of a pinch gesture
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

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
      if (disabled || didDragRef.current) { return; }
      onCountryClick(iso3);
    },
    [disabled, onCountryClick],
  );

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX_SCALE, s * 1.4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(MIN_SCALE, s / 1.4)), []);
  const zoomReset = useCallback(() => setScale(BASE_SCALE), []);

  return (
    <div
      className={styles.container}
      data-testid="globe"
      ref={containerRef}
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
          {({ geographies }) =>
            geographies.map((geo) => {
              const iso3 = numericToIso3[String(geo.id).padStart(3, '0')];
              const tier = iso3 ? highlight[iso3] : undefined;
              const fill = tier ? TIER_COLOUR[tier] : 'var(--colour-globe-land)';
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
                      fill: disabled ? fill : 'var(--colour-accent)',
                      cursor: disabled ? 'default' : 'pointer',
                    },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
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
