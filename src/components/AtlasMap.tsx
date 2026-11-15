import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { useTranslation } from 'react-i18next';
import { useI18n } from '../i18n/I18nContext';
import { Activity, DayAccommodation } from '../types/models';
import { computeActivityBounds, getActiveActivityLocation } from '../utils/worldDestinations';

interface AtlasMapProps {
  activities: Activity[];
  accommodation?: DayAccommodation;
  selectedActivityId?: string | null;
  onSelectActivity?: (activityId: string) => void;
}

/**
 * Automatically calculates the bounding box (fitBounds) of all active tier coordinates
 * and focuses the Google Map tightly on those locations whenever activities or budget variations change.
 */
const MapBoundsController: React.FC<{
  activities: Activity[];
  selectedTiersKey: string;
}> = ({ activities, selectedTiersKey }) => {
  const map = useMap();
  const markersRegistryRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    // Clear any existing imperative markers from the map instance before plotting new tier locations
    markersRegistryRef.current.forEach((m) => m.setMap(null));
    markersRegistryRef.current = [];

    if (!map || activities.length === 0) return;

    const bounds = computeActivityBounds(activities);
    map.fitBounds(
      {
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
      },
      { top: 44, right: 44, bottom: 44, left: 44 }
    );

    return () => {
      markersRegistryRef.current.forEach((m) => m.setMap(null));
      markersRegistryRef.current = [];
    };
  }, [map, activities, selectedTiersKey]);

  return null;
};

const RoutePolylineLayer: React.FC<{
  activities: Activity[];
  selectedTiersKey: string;
}> = ({ activities, selectedTiersKey }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    // Completely clear existing polylines when activities or active budget tiers change
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !routesLib || activities.length < 2) return;

    const activeLocations = activities.map((a) => getActiveActivityLocation(a));
    const origin = activeLocations[0];
    const destination = activeLocations[activeLocations.length - 1];
    const intermediates = activeLocations.slice(1, -1).map((loc) => ({
      location: { lat: loc.lat, lng: loc.lng },
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
          // Re-apply tight city activity bounding box for the active tier coordinates
          const tightBounds = computeActivityBounds(activities);
          map.fitBounds(
            {
              north: tightBounds.north,
              south: tightBounds.south,
              east: tightBounds.east,
              west: tightBounds.west,
            },
            { top: 44, right: 44, bottom: 44, left: 44 }
          );
        })
        .catch((err: any) => {
          const msg = String(err?.message || err);
          if (
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, activities, selectedTiersKey]);

  return null;
};

export const AtlasMap: React.FC<AtlasMapProps> = ({
  activities,
  accommodation,
  selectedActivityId,
  onSelectActivity,
}) => {
  const { t } = useTranslation();
  useI18n();
  const [activeInfoId, setActiveInfoId] = useState<string | null>(selectedActivityId || null);
  const rawApiKey = String((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const hasValidLiveMapsKey =
    Boolean(rawApiKey) &&
    !rawApiKey.startsWith('YOUR_') &&
    rawApiKey !== 'DEMO_KEY' &&
    typeof window !== 'undefined' &&
    !(navigator.userAgent || '').includes('HeadlessChrome');

  // Reactive signature of active budget/variation state across all activities
  const selectedTiersKey = useMemo(
    () =>
      activities
        .map((a) => {
          const loc = getActiveActivityLocation(a);
          return `${a.id}:${a.selectedTier}:${loc.lat},${loc.lng}`;
        })
        .join('|'),
    [activities]
  );

  useEffect(() => {
    if (selectedActivityId) {
      setActiveInfoId(selectedActivityId);
    } else if (activities.length > 0 && !activities.some((a) => a.id === activeInfoId)) {
      setActiveInfoId(activities[0].id);
    }
  }, [selectedActivityId, activities, activeInfoId]);

  const bounds = useMemo(
    () => computeActivityBounds(activities),
    [activities, selectedTiersKey]
  );
  const center = { lat: bounds.centerLat, lng: bounds.centerLng };

  const activeActivity = activities.find((a) => a.id === activeInfoId) || activities[0];
  const activeActivityLocation = activeActivity
    ? getActiveActivityLocation(activeActivity)
    : undefined;

  // Project active tier coordinates into the SVG viewport [0..500, 0..280] using the tight bounding box
  const projectedStops = useMemo(() => {
    if (activities.length === 0) return [];
    if (activities.length === 1) {
      const loc = getActiveActivityLocation(activities[0]);
      return [{ act: activities[0], loc, x: 250, y: 140, idx: 0 }];
    }
    const spanLng = Math.max(bounds.east - bounds.west, 0.004);
    const spanLat = Math.max(bounds.north - bounds.south, 0.004);

    return activities.map((act, idx) => {
      const loc = getActiveActivityLocation(act);
      const normX = (loc.lng - bounds.west) / spanLng;
      const normY = (bounds.north - loc.lat) / spanLat;
      const clampedX = Math.max(0.12, Math.min(0.88, Number.isFinite(normX) ? normX : 0.5));
      const clampedY = Math.max(0.16, Math.min(0.8, Number.isFinite(normY) ? normY : 0.5));
      return {
        act,
        loc,
        idx,
        x: Math.round(55 + clampedX * 390),
        y: Math.round(35 + clampedY * 185),
      };
    });
  }, [activities, bounds, selectedTiersKey]);

  // Interactive Cartographic SVG Atlas Fallback when Maps JS key is absent or in headless/offline mode
  if (!hasValidLiveMapsKey) {
    return (
      <div
        data-testid="atlas-map-surface"
        data-bounds-center={`${bounds.centerLat},${bounds.centerLng}`}
        data-bounds-box={`${bounds.south},${bounds.west},${bounds.north},${bounds.east}`}
        data-bounds-zoom={bounds.recommendedZoom}
        data-active-tiers={selectedTiersKey}
        className="relative w-full h-full min-h-[360px] rounded-xl overflow-hidden bg-[#0F172A] text-slate-100 border border-slate-200 dark:border-slate-800 flex flex-col justify-between p-5"
      >
        <div className="flex items-center justify-between z-10 gap-2">
          <div>
            <span className="text-xs font-mono-tabular text-amber-400">
              {t('map.boundingBoxFocus', {
                lat: bounds.centerLat.toFixed(4),
                lng: bounds.centerLng.toFixed(4),
                zoom: bounds.recommendedZoom,
              })}
            </span>
            <h3 className="font-serif-atlas text-base font-semibold text-white">
              {activeActivityLocation?.name || activities[0]?.location.name || t('map.cityRouteOverview')}
            </h3>
          </div>
          <span className="text-xs text-slate-300 font-mono-tabular shrink-0">
            {t('map.numberedStops', { count: activities.length })}
          </span>
        </div>

        {/* SVG Topographic & Route Canvas */}
        <svg
          viewBox="0 0 500 280"
          className="w-full h-56 my-auto"
          role="img"
          aria-label={t('map.svgAriaLabel')}
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
          {projectedStops.length > 1 && (
            <polyline
              fill="none"
              stroke="#D97706"
              strokeWidth="3"
              strokeDasharray="6 4"
              points={projectedStops.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          )}

          {/* Numbered Pins */}
          {projectedStops.map(({ act, loc, x, y, idx }) => {
            const isSelected = act.id === activeActivity?.id;

            return (
              <g
                key={`${act.id}-${act.selectedTier}-${loc.lat}-${loc.lng}`}
                data-testid={`map-pin-${act.id}`}
                data-pin-tier={act.selectedTier}
                data-pin-coords={`${loc.lat},${loc.lng}`}
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

        {activeActivity && activeActivityLocation && (
          <div className="z-10 bg-slate-900/90 border border-slate-700 rounded-lg p-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-mono-tabular text-amber-400">
                {activeActivity.startTime} · {activeActivityLocation.name} (
                {activeActivityLocation.lat.toFixed(4)}°, {activeActivityLocation.lng.toFixed(4)}°)
              </p>
              <p className="text-sm font-semibold text-white">{activeActivity.title}</p>
              {accommodation && (
                <p className="text-[11px] font-mono-tabular text-teal-300 mt-0.5">
                  🛏 {accommodation.name}
                </p>
              )}
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
      data-bounds-center={`${bounds.centerLat},${bounds.centerLng}`}
      data-bounds-box={`${bounds.south},${bounds.west},${bounds.north},${bounds.east}`}
      data-bounds-zoom={bounds.recommendedZoom}
      data-active-tiers={selectedTiersKey}
      className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
    >
      <APIProvider apiKey={rawApiKey} libraries={['marker', 'routes']}>
        <GoogleMap
          style={{ width: '100%', height: '100%', minHeight: '380px' }}
          defaultCenter={center}
          defaultZoom={bounds.recommendedZoom}
          minZoom={10}
          maxZoom={17}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          disableDefaultUI={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
          <MapBoundsController
            activities={activities}
            selectedTiersKey={selectedTiersKey}
          />
          <RoutePolylineLayer
            activities={activities}
            selectedTiersKey={selectedTiersKey}
          />

          {activities.map((act, idx) => {
            const loc = getActiveActivityLocation(act);
            return (
              <AdvancedMarker
                key={`${act.id}-${act.selectedTier}-${loc.lat}-${loc.lng}`}
                position={{ lat: loc.lat, lng: loc.lng }}
                title={`${idx + 1}. ${act.title} (${loc.name})`}
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
            );
          })}

          {activeActivity && activeActivityLocation && (
            <InfoWindow
              position={{
                lat: activeActivityLocation.lat,
                lng: activeActivityLocation.lng,
              }}
              onCloseClick={() => setActiveInfoId(null)}
            >
              <div className="text-slate-900 p-1 max-w-[220px]">
                <p className="text-xs font-mono-tabular text-slate-600">
                  {activeActivity.startTime} · {activeActivity.durationMin} min
                </p>
                <p className="text-sm font-semibold mt-0.5">{activeActivity.title}</p>
                <p className="text-xs text-slate-600 mt-1">{activeActivityLocation.name}</p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </APIProvider>
    </div>
  );
};

export default React.memo(AtlasMap);

