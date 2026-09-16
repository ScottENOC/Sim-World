# Institutional player UI v1

This pass makes the institutional politics introduced in PRs 118–120 visible and binding for the player.

## Chancellor

The Chancellor now reports parliament and judiciary establishment, strength/representation/independence, the number of powers still controlled by the executive, powers that require institutional consent, political voice, institutional pressure, protests, coup pressure and revolutionary pressure.

Active institutional demands appear as decisions. Accepting a demand for institutional control adds that institution as a real consent requirement for the named government power. Rejecting it resolves the demand as rejected and feeds the existing crisis-pressure consequences.

## Offensive war

The legacy Marshal campaign button is intercepted before it can call the unconstrained campaign launcher. The same target/objective/troop selection is instead passed through the institutional action system.

If offensive war is an executive power with no required consent, play is unchanged. If parliament or another institution holds or shares the power, that institution evaluates the proposed offensive using public support, threat, hostility and fiscal stress. Refusal blocks the campaign and is reported in the Marshal panel. Approval is passed to `executeGovernmentCampaign`, which rechecks constitutional authority before launching.

This is deliberately the first player-action wiring tranche. Standing military policy, taxation, spending, treaties, detention/prosecution and intelligence operations still need their existing UI call sites routed through the same governed execution layer in later passes.
