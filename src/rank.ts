export const rankTiers = [
  { name: 'Rookie', min: 0, max: 99, color: 'rookie' },
  { name: 'Bronze', min: 100, max: 299, color: 'bronze' },
  { name: 'Silver', min: 300, max: 599, color: 'silver' },
  { name: 'Gold', min: 600, max: 999, color: 'gold' },
  { name: 'Platinum', min: 1000, max: 1499, color: 'platinum' },
  { name: 'Diamond', min: 1500, max: 2199, color: 'diamond' },
  { name: 'Master', min: 2200, max: Infinity, color: 'master' },
] as const;

export type RankName = (typeof rankTiers)[number]['name'];
export type CompetitiveOutcome = 'win' | 'loss' | 'draw' | 'abandoned' | 'invalid';

export function calculateRank(points: number) {
  const safePoints = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));
  for (let index = rankTiers.length - 1; index >= 0; index -= 1) {
    if (safePoints >= rankTiers[index].min) return rankTiers[index];
  }
  return rankTiers[0];
}

export function calculateRankProgress(points: number) {
  const safePoints = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));
  let currentIndex = 0;
  for (let index = rankTiers.length - 1; index >= 0; index -= 1) {
    if (safePoints >= rankTiers[index].min) {
      currentIndex = index;
      break;
    }
  }
  const current = rankTiers[currentIndex];
  const next = rankTiers[currentIndex + 1];
  if (!next) return { current, next: null, progress: 100, pointsToNext: 0 };
  const span = next.min - current.min;
  return {
    current,
    next,
    progress: Math.min(100, Math.max(0, ((safePoints - current.min) / span) * 100)),
    pointsToNext: next.min - safePoints,
  };
}

export function calculateCompetitiveResult(points: number, outcome: CompetitiveOutcome) {
  const previousPoints = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));
  const delta = outcome === 'win' ? 25 : outcome === 'loss' ? -15 : 0;
  const eligible = outcome === 'win' || outcome === 'loss' || outcome === 'draw';
  const nextPoints = eligible ? Math.max(0, previousPoints + delta) : previousPoints;
  const previousRank = calculateRank(previousPoints);
  const newRank = calculateRank(nextPoints);
  return {
    eligible,
    outcome,
    rpChange: eligible ? nextPoints - previousPoints : 0,
    previousPoints,
    nextPoints,
    previousRank: previousRank.name,
    newRank: newRank.name,
    promoted: rankTiers.findIndex((tier) => tier.name === newRank.name) > rankTiers.findIndex((tier) => tier.name === previousRank.name),
    demoted: rankTiers.findIndex((tier) => tier.name === newRank.name) < rankTiers.findIndex((tier) => tier.name === previousRank.name),
  };
}