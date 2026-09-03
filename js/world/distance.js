const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

// Great-circle distance between region centroids. Calculating this for the
// small set of routes actually being considered is far cheaper than loading
// and retaining an every-region-to-every-region distance matrix.
export function centroidDistanceKm(regionA, regionB) {
  const [lonA, latA] = regionA?.centroid || [];
  const [lonB, latB] = regionB?.centroid || [];
  if (![lonA, latA, lonB, latB].every(Number.isFinite)) return null;

  const lat1 = toRadians(latA);
  const lat2 = toRadians(latB);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(lonB - lonA);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}
