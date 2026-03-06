import { useState, useCallback, useRef } from 'react';
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

const GEO_URL = '/world-110m.json';
const SCALE = 220;
const WIDTH = 500;
const HEIGHT = 500;
const ROTATION_SENSITIVITY = 0.4;

export interface GlobeProps {
  onCountryClick: (iso3: string) => void;
  highlight?: Record<string, Tier>;
  /** Arrow from the guessed country pointing in the direction of the answer */
  arrow?: { fromIso3: string; bearingDeg: number };
  disabled?: boolean;
}

// Tier colour variables map to CSS custom properties
const TIER_COLOUR: Record<Tier, string> = {
  bullseye: 'var(--colour-bullseye)',
  top5: 'var(--colour-top5)',
  top15: 'var(--colour-top15)',
  cold: 'var(--colour-cold)',
};

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;
const ARROW_ARC_DEG = 22; // angular distance of the arrow tip from the centroid

/** Computes a destination [lon, lat] given start, bearing, and angular distance (degrees) */
function destPoint(lon0: number, lat0: number, bearing: number, arcDeg: number): [number, number] {
  const d = arcDeg * TO_RAD;
  const b = bearing * TO_RAD;
  const lat1 = lat0 * TO_RAD;
  const lon1 = lon0 * TO_RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [lon2 * TO_DEG, lat2 * TO_DEG];
}

/** Drawn inside ComposableMap so it has access to the projection */
function HintArrow({
  fromIso3,
  bearingDeg,
}: {
  fromIso3: string;
  bearingDeg: number;
}) {
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
          id="arrowhead"
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
        markerEnd="url(#arrowhead)"
        className={styles.arrow}
      />
    </g>
  );
}

export function Globe({ onCountryClick, highlight = {}, arrow, disabled = false }: GlobeProps) {
  const [rotation, setRotation] = useState<[number, number]>([0, -30]);
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number] } | null>(null);
  const didDragRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, rotation: [...rotation] as [number, number] };
    didDragRef.current = false;
  }, [rotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) { return; }
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      didDragRef.current = true;
    }
    setRotation([
      dragRef.current.rotation[0] + dx * ROTATION_SENSITIVITY,
      dragRef.current.rotation[1] - dy * ROTATION_SENSITIVITY,
    ]);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleCountryClick = useCallback(
    (iso3: string) => {
      if (disabled || didDragRef.current) { return; }
      onCountryClick(iso3);
    },
    [disabled, onCountryClick],
  );

  return (
    <div className={styles.container} data-testid="globe">
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ scale: SCALE, rotate: [rotation[0], rotation[1], 0] }}
        width={WIDTH}
        height={HEIGHT}
        style={{ width: '100%', height: 'auto' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Sphere
          id="sphere"
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
                    hover: { outline: 'none', fill: disabled ? fill : 'var(--colour-accent)', cursor: disabled ? 'default' : 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>
        {arrow && <HintArrow fromIso3={arrow.fromIso3} bearingDeg={arrow.bearingDeg} />}
      </ComposableMap>
    </div>
  );
}
