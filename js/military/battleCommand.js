const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function battleParticipationFraction(campaign, region) {
  const command = campaign?.battleCommand || {};
  let fraction = clamp(command.intendedCommitmentFraction ?? 0.88, 0.12, 1);
  const supply = clamp(campaign?.supply ?? campaign?.logisticsState?.supplyFraction ?? 1);
  const morale = clamp(campaign?.attackerMorale ?? 1);
  if (campaign?.logisticsState?.status === 'starving') fraction = Math.max(fraction, 0.95);
  else if (campaign?.logisticsState?.status === 'severe_shortage') fraction = Math.max(fraction, 0.85);
  else {
    fraction *= 0.78 + morale * 0.22;
    fraction *= 0.82 + supply * 0.18;
  }
  const posture = region?.militaryStrategy?.posture;
  if (posture === 'emergency_defence' || posture === 'mobilise_war') fraction = Math.max(fraction, 0.92);
  return clamp(fraction, 0.12, 1);
}
