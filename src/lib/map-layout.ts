export type ScreenPoint = { id: string; x: number; y: number };
export type SpreadPoint = ScreenPoint & { anchorX: number; anchorY: number; displaced: boolean };

/** Keep every marker visible, including records sharing the same approximate point. */
export function spreadMapPoints(points: ScreenPoint[], spacing = 50): SpreadPoint[] {
  const parents = points.map((_, index) => index);
  function root(index: number): number {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  }
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 1; second < points.length; second++) {
      if (Math.hypot(points[first].x - points[second].x, points[first].y - points[second].y) < spacing) parents[root(second)] = root(first);
    }
  }
  const groups = new Map<number, ScreenPoint[]>();
  points.forEach((point, index) => { const key = root(index); groups.set(key, [...(groups.get(key) || []), point]); });
  const placed: SpreadPoint[] = [];
  const occupied = (x: number, y: number) => placed.some(point => Math.hypot(point.x - x, point.y - y) < spacing - 0.01);
  for (const group of groups.values()) {
    group.sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }));
    const centerX = group.reduce((sum, point) => sum + point.x, 0) / group.length;
    const centerY = group.reduce((sum, point) => sum + point.y, 0) / group.length;
    const columns = Math.ceil(Math.sqrt(group.length)), rows = Math.ceil(group.length / columns);
    group.forEach((point, index) => {
      const row = Math.floor(index / columns), rowCount = Math.min(columns, group.length - row * columns);
      const targetX = group.length === 1 ? point.x : centerX + (index % columns - (rowCount - 1) / 2) * spacing;
      const targetY = group.length === 1 ? point.y : centerY + (row - (rows - 1) / 2) * spacing;
      let x = targetX, y = targetY;
      // Expanded neighboring groups can touch. Find the nearest unoccupied grid slot.
      if (occupied(x, y)) {
        search: for (let ring = 1; ring <= points.length; ring++) {
          for (let dx = -ring; dx <= ring; dx++) {
            for (let dy = -ring; dy <= ring; dy++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
              const candidateX = targetX + dx * spacing, candidateY = targetY + dy * spacing;
              if (!occupied(candidateX, candidateY)) { x = candidateX; y = candidateY; break search; }
            }
          }
        }
      }
      placed.push({ id: point.id, x, y, anchorX: point.x, anchorY: point.y, displaced: Math.hypot(x - point.x, y - point.y) > 0.5 });
    });
  }
  return placed;
}
