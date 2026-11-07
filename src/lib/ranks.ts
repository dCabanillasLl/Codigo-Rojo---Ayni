export type NeighborRank = { name: string; minimum: number; next: number | null };
const ranks: NeighborRank[] = [
  { name: 'Semilla', minimum: 0, next: 2 },
  { name: 'Tejedor', minimum: 2, next: 5 },
  { name: 'Ayni', minimum: 5, next: 10 },
  { name: 'Referente', minimum: 10, next: null },
];
/** Rank is derived only from server-confirmed collaborations, never self-reported ratings. */
export function neighborRank(completedCollaborations: number): NeighborRank {
  return [...ranks].reverse().find(rank => completedCollaborations >= rank.minimum) || ranks[0];
}
