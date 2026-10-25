<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = withDefaults(
  defineProps<{
    lat?: number;
    lng?: number;
    accuracy?: number;
    isStale?: boolean;
    interactive?: boolean;
  }>(),
  {
    interactive: true,
    isStale: false,
  }
);

const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let marker: L.CircleMarker | null = null;
let accuracyCircle: L.Circle | null = null;

const DEFAULT_CENTER: L.LatLngExpression = [20, 0];
const DEFAULT_ZOOM = 2;
const POSITION_ZOOM = 16;

function getMarkerColor(): string {
  return props.isStale ? '#94a3b8' : '#2563eb';
}

function getAccuracyColor(): string {
  return props.isStale ? 'rgba(148, 163, 184, 0.2)' : 'rgba(37, 99, 235, 0.15)';
}

let resizeObserver: ResizeObserver | null = null;

function updatePosition(): void {
  if (!map) return;
  map.invalidateSize();

  if (props.lat == null || props.lng == null) {
    // No position — remove markers, show world view
    if (marker) {
      marker.remove();
      marker = null;
    }
    if (accuracyCircle) {
      accuracyCircle.remove();
      accuracyCircle = null;
    }
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }

  const latlng: L.LatLngExpression = [props.lat, props.lng];
  const accuracy = props.accuracy ?? 50;
  const color = getMarkerColor();
  const accColor = getAccuracyColor();

  if (marker) {
    marker.setLatLng(latlng);
    marker.setStyle({ color, fillColor: color });
  } else {
    marker = L.circleMarker(latlng, {
      radius: 8,
      color,
      fillColor: color,
      fillOpacity: props.isStale ? 0.4 : 0.9,
      weight: 3,
    }).addTo(map);
  }

  if (accuracyCircle) {
    accuracyCircle.setLatLng(latlng);
    accuracyCircle.setRadius(accuracy);
    accuracyCircle.setStyle({ color, fillColor: accColor });
  } else {
    accuracyCircle = L.circle(latlng, {
      radius: accuracy,
      color,
      fillColor: accColor,
      fillOpacity: 0.2,
      weight: 1,
    }).addTo(map);
  }

  map.setView(latlng, Math.max(map.getZoom(), POSITION_ZOOM));
}

onMounted(async () => {
  await nextTick();
  if (!mapContainer.value) return;

  map = L.map(mapContainer.value, {
    zoomControl: props.interactive,
    dragging: props.interactive,
    scrollWheelZoom: props.interactive,
    doubleClickZoom: props.interactive,
    touchZoom: props.interactive,
    boxZoom: props.interactive,
    keyboard: props.interactive,
    attributionControl: true,
  });

  // Primary: High-speed CARTO Voyager OSM tiles (globally CDN cached, non-blocking)
  const cartoLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  );

  cartoLayer.addTo(map);

  // Backup fallback: OpenStreetMap volunteer tiles
  let fallbackTriggered = false;
  cartoLayer.on('tileerror', () => {
    if (!fallbackTriggered && map) {
      fallbackTriggered = true;
      try {
        map.removeLayer(cartoLayer);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
      } catch {
        // Ignore if unmounted
      }
    }
  });

  // Ensure map measures container dimensions properly after render / expansion
  map.invalidateSize();
  setTimeout(() => {
    map?.invalidateSize();
    if (props.lat != null && props.lng != null) {
      updatePosition();
    }
  }, 100);
  setTimeout(() => {
    map?.invalidateSize();
  }, 350);

  // Responsive container resize observer (e.g., accordion expand / window resize)
  if (typeof ResizeObserver !== 'undefined' && mapContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      map?.invalidateSize();
    });
    resizeObserver.observe(mapContainer.value);
  }

  if (props.lat != null && props.lng != null) {
    updatePosition();
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
});

watch(
  () => [props.lat, props.lng, props.accuracy, props.isStale],
  () => updatePosition()
);

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container" role="img" aria-label="Location map" />
    <div v-if="isStale" class="stale-badge">
      <span class="stale-dot" aria-hidden="true" />
      Stale
    </div>
    <div v-if="lat == null || lng == null" class="map-placeholder">
      <span class="map-placeholder-icon" aria-hidden="true">🗺️</span>
      <span class="map-placeholder-text">Waiting for location…</span>
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
  z-index: 0;
}

.stale-badge {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: rgba(255, 255, 255, 0.95);
  color: var(--color-warning);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: var(--shadow-md);
  z-index: 10;
}

.stale-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-warning);
}

.map-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: rgba(248, 250, 252, 0.85);
  z-index: 5;
  pointer-events: none;
}

.map-placeholder-icon {
  font-size: 2rem;
}

.map-placeholder-text {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}
</style>
