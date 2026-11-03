import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Activity } from '../types/models';

interface AtlasMapProps {
  activities: Activity[];
  selectedActivityId?: string | null;
  onSelectActivity?: (activityId: string) => void;
}

const RoutePolylineLayer: React.FC<{ activities: Activity[] }> = ({ activities }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !routesLib || activities.length < 2) return;

    const origin = activities[0].location;
    const destination = activities[activities.length - 1].location;
    const intermediates = activities.slice(1, -1).map((a) => ({
      location: { lat: a.location.lat, lng: a.location.lng },
    }));

    const RouteClass = (routesLib as any).Route;
    if (RouteClass && typeof RouteClass.computeRoutes === 'function') {
      RouteClass.computeRoutes({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        intermediates,
        travelMode: 'WALKING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      })
        .then((res: any) => {
          const primaryRoute = res?.routes?.[0];
          if (!primaryRoute) return;
          if (typeof primaryRoute.createPolylines === 'function') {
            const lines: google.maps.Polyline[] = primaryRoute.createPolylines();
            lines.forEach((line) => {
              line.setOptions({
                strokeColor: '#D97706',
                strokeWeight: 4,
              });
              line.setMap(map);
            });
            polylinesRef.current = lines;
          }
          if (primaryRoute.viewport) {
            map.fitBounds(primaryRoute.viewport);
          }
        })
        .catch((err: any) => {
          const msg = String(err?.message || err);
          if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, activities]);

  return null;
};

export const AtlasMap: React.FC<AtlasMapProps> = ({
  activities,
  selectedActivityId,
  onSelectActivity,
}) => {
  const [activeInfoId, setActiveInfoId] = useState<string | null>(selectedActivityId || null);
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (selectedActivityId) {
      setActiveInfoId(selectedActivityId);
    }
  }, [selectedActivityId]);

  const center =
    activities.length > 0
      ? { lat: activities[0].location.lat, lng: activities[0].location.lng }
      : { lat: 38.7139, lng: -9.1334 };

  const activeActivity = activities.find((a) => a.id === activeInfoId);

  // Interactive Cartographic SVG Atlas Fallback when Maps JS key is absent or in headless/offline mode
  if (!apiKey) {
    return (
      <div
        data-testid="atlas-map-surface"
        className="relative w-full h-full min-h-[360px] rounded-xl overflow-hidden bg-[#0F172A] text-slate-100 border border-slate-200 dark:border-slate-800 flex flex-col justify-between p-5"
      >
        <div className="flex items-center justify-between z-10">
          <div>
            <span className="text-xs font-mono-tabular text-amber-400">
              Interactive Cartographic Route View
            </span>
            <h3 className="font-serif-atlas text-base font-semibold text-white">
              {activities[0]?.location.name || 'European Route Overview'}
            </h3>
          </div>
          <span className="text-xs text-slate-300 font-mono-tabular">
            {activities.length} numbered stops
          </span>
        </div>

        {/* SVG Topographic & Route Canvas */}
        <svg
          viewBox="0 0 500 280"
          className="w-full h-56 my-auto"
          role="img"
          aria-label="Interactive itinerary route map with numbered pins"
        >
          <defs>
            <pattern id="atlasGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="500" height="280" fill="url(#atlasGrid)" rx="12" />

          {/* Connecting route line */}
          {activities.length > 1 && (
            <polyline
              fill="none"
              stroke="#D97706"
              strokeWidth="3"
              strokeDasharray="6 4"
              points={activities
                .map((_, idx) => {
                  const x = 70 + (idx * 360) / Math.max(1, activities.length - 1);
                  const y = idx % 2 === 0 ? 95 : 185;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
          )}

          {/* Numbered Pins */}
          {activities.map((act, idx) => {
            const x =
              activities.length === 1
                ? 250
                : 70 + (idx * 360) / Math.max(1, activities.length - 1);
            const y = idx % 2 === 0 ? 95 : 185;
            const isSelected = act.id === activeInfoId;

            return (
              <g
                key={act.id}
                onClick={() => {
                  setActiveInfoId(act.id);
                  onSelectActivity?.(act.id);
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 18 : 14}
                  fill={isSelected ? '#0D9488' : '#D97706'}
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {idx + 1}
                </text>
                <text
                  x={x}
                  y={y + 32}
                  textAnchor="middle"
                  fill="#E2E8F0"
                  fontSize="10"
                >
                  {act.title.slice(0, 18)}
                </text>
              </g>
            );
          })}
        </svg>

        {activeActivity && (
          <div className="z-10 bg-slate-900/90 border border-slate-700 rounded-lg p-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-mono-tabular text-amber-400">
                {activeActivity.startTime} · {activeActivity.location.name}
              </p>
              <p className="text-sm font-semibold text-white">{activeActivity.title}</p>
            </div>
            <span className="text-xs font-mono-tabular text-slate-300 shrink-0">
              {activeActivity.priceConfidence.status === 'verified' ? '' : '~'}
              €{activeActivity.costOptions[activeActivity.selectedTier].estimatedCost}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="atlas-map-surface"
      className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
    >
      <APIProvider apiKey={apiKey} libraries={['marker', 'routes']}>
        <GoogleMap
          style={{ width: '100%', height: '100%', minHeight: '380px' }}
          defaultCenter={center}
          defaultZoom={13}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          disableDefaultUI={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
          <RoutePolylineLayer activities={activities} />

          {activities.map((act, idx) => (
            <AdvancedMarker
              key={act.id}
              position={{ lat: act.location.lat, lng: act.location.lng }}
              title={`${idx + 1}. ${act.title}`}
              onClick={() => {
                setActiveInfoId(act.id);
                onSelectActivity?.(act.id);
              }}
            >
              <Pin
                background={activeInfoId === act.id ? '#0D9488' : '#D97706'}
                borderColor="#0F172A"
                glyphColor="#FFFFFF"
                scale={1.15}
              >
                {String(idx + 1)}
              </Pin>
            </AdvancedMarker>
          ))}

          {activeActivity && (
            <InfoWindow
              position={{
                lat: activeActivity.location.lat,
                lng: activeActivity.location.lng,
              }}
              onCloseClick={() => setActiveInfoId(null)}
            >
              <div className="text-slate-900 p-1 max-w-[220px]">
                <p className="text-xs font-mono-tabular text-slate-600">
                  {activeActivity.startTime} · {activeActivity.durationMin} min
                </p>
                <p className="text-sm font-semibold mt-0.5">{activeActivity.title}</p>
                <p className="text-xs text-slate-600 mt-1">{activeActivity.location.name}</p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </APIProvider>
    </div>
  );
};
