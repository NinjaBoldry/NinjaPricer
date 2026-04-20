export interface PersonaMixItem {
  personaId: string;
  pct: number;
}

// Distribute 100 across N personas so the pcts are as even as possible and sum to exactly 100.
// Example: 3 personas => [34, 33, 33]; 7 personas => [15, 15, 14, 14, 14, 14, 14].
export function buildEvenMix(personaIds: string[]): PersonaMixItem[] {
  const n = personaIds.length;
  if (n === 0) return [];
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  return personaIds.map((personaId, i) => ({
    personaId,
    pct: base + (i < remainder ? 1 : 0),
  }));
}
