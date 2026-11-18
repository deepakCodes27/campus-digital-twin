// Add verified walking connections here later.
// Format: ["starting building ID", "ending building ID", distance in metres]
export const campusEdges = [
  ["1", "2", 114], // Main Gate Entrance ↔ Water Fountain
];
export function findRoute(start, destination, nodes, edges) {
  if (!nodes[start] || !nodes[destination]) return null;

  const distances = {};
  const previous = {};
  const remaining = new Set(Object.keys(nodes));

  for (const id of remaining) distances[id] = Infinity;
  distances[start] = 0;

  while (remaining.size > 0) {
    let current = null;

    for (const id of remaining) {
      if (current === null || distances[id] < distances[current]) {
        current = id;
      }
    }

    if (distances[current] === Infinity) break;
    if (current === destination) break;

    remaining.delete(current);

    for (const [a, b, weight] of edges) {
      const neighbour = a === current ? b : b === current ? a : null;

      if (!neighbour || !remaining.has(neighbour)) continue;

      const candidate = distances[current] + weight;

      if (candidate < distances[neighbour]) {
        distances[neighbour] = candidate;
        previous[neighbour] = current;
      }
    }
  }

  if (distances[destination] === Infinity) return null;

  const path = [];

  for (let id = destination; id !== undefined; id = previous[id]) {
    path.unshift(id);
  }

  return { path, distance: distances[destination] };
}
// Calculate the approximate length of a drawn path in metres.
// Each point uses [latitude, longitude].
export function calculatePathDistance(points) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];

    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lng2 - lng1);

    const a =
      Math.sin(latitudeDifference / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(longitudeDifference / 2) ** 2;

    const clamped = Math.min(1, Math.max(0, a));

    total +=
      earthRadius *
      2 *
      Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  }

  return total;
}

// Find the shortest route using walkways saved in Supabase.
// Saved walkways are treated as walkable in both directions.
export function findWalkwayRoute(start, destination, nodes, walkways) {
  const validWalkways = walkways.filter((walkway) => {
    const from = String(walkway.start_building_id);
    const to = String(walkway.end_building_id);
    const points = walkway.coordinates;

    return (
      nodes[from] &&
      nodes[to] &&
      Array.isArray(points) &&
      points.length >= 2 &&
      points.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]) &&
          Math.abs(point[0]) <= 90 &&
          Math.abs(point[1]) <= 180
      ) &&
      Number.isFinite(walkway.distance_metres) &&
      walkway.distance_metres > 0
    );
  });

  const edges = validWalkways.map((walkway) => [
    String(walkway.start_building_id),
    String(walkway.end_building_id),
    walkway.distance_metres,
  ]);

  const result = findRoute(start, destination, nodes, edges);

  if (!result) return null;

  const coordinates = [];

  for (let i = 1; i < result.path.length; i++) {
    const from = result.path[i - 1];
    const to = result.path[i];

    // If several paths connect the same locations, use the shortest.
    const matching = validWalkways
      .filter((walkway) => {
        const a = String(walkway.start_building_id);
        const b = String(walkway.end_building_id);

        return (
          (a === from && b === to) ||
          (a === to && b === from)
        );
      })
      .sort((a, b) => a.distance_metres - b.distance_metres);

    const walkway = matching[0];

    if (!walkway) return null;

    const points =
      String(walkway.start_building_id) === from
        ? walkway.coordinates
        : [...walkway.coordinates].reverse();

    coordinates.push(...points);
  }

  return {
    ...result,
    distance: Math.round(result.distance),
    coordinates,
  };
}