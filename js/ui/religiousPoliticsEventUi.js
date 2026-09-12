export function handleReligiousPoliticsEvent(event, clock, eventQueue, showNextEvent) {
  const supported = new Set([
    'religious_ruler_recognition_offer','religious_ruler_sanction','religious_appointment_conflict',
    'religious_council','religious_authority_rivalry','religious_peace_call','religious_war_call',
    'religious_seat_occupied','religious_authority_relocated','religious_seat_restored',
  ]);
  if (!supported.has(event?.type)) return false;
  const title = document.getElementById('event-title');
  const body = document.getElementById('event-body');
  const options = document.getElementById('event-options');
  const modal = document.getElementById('event-modal');
  const continueOnly = () => {
    options.innerHTML = '<button id="btn-event-continue">Continue</button>';
    modal.classList.remove('hidden');
    document.getElementById('btn-event-continue').addEventListener('click', () => {
      modal.classList.add('hidden');
      if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause();
    });
  };
  if (event.type === 'religious_ruler_recognition_offer') {
    title.textContent = 'Religious authority offers recognition';
    body.textContent = 'A transnational religious authority is prepared to recognise your ruler during a disputed succession. Recognition can strengthen legitimacy among its followers, but also increases the authority’s standing in your political order.';
    options.innerHTML = '<button data-choice="accept">Accept recognition</button><button data-choice="decline">Decline</button>';
    modal.classList.remove('hidden');
    options.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => {
      event.resolveDecision?.(button.dataset.choice);
      modal.classList.add('hidden');
      if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause();
    }));
    return true;
  }
  if (event.type === 'religious_appointment_conflict') {
    title.textContent = 'Conflict over religious appointments';
    body.textContent = 'The state and an organised religious authority are contesting who controls senior religious appointments. You can insist on state appointment, concede appointment to the authority, share the power, or leave appointments locally decentralised.';
    options.innerHTML = [
      ['state','State appoints'],['shared','Share appointments'],['authority','Authority appoints'],['local','Leave appointments local'],
    ].map(([id,label]) => `<button data-choice="${id}">${label}</button>`).join('');
    modal.classList.remove('hidden');
    options.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => {
      event.resolveDecision?.(button.dataset.choice);
      modal.classList.add('hidden');
      if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause();
    }));
    return true;
  }
  const copy = {
    religious_ruler_sanction:['Ruler condemned by religious authority','An influential religious authority has withdrawn recognition and sanctioned the ruler. The political cost depends on how many subjects follow that religion and how much influence the authority actually has.'],
    religious_council:['Religious council meets',event.success ? 'A council has settled part of an organised doctrinal dispute and strengthened institutional cohesion.' : 'A council has failed to settle the dispute. Rival interpretations and political patrons are now harder to reconcile.'],
    religious_authority_rivalry:['Competing religious authorities','Two organised authorities within the same religious family now compete for recognition and influence. Neither is automatically supreme.'],
    religious_peace_call:['Religious authority demands peace','A transnational religious authority has called on rulers who share its faith to end their war. Continuing the conflict now carries a follower-weighted legitimacy cost.'],
    religious_war_call:['Religious authority endorses the war','A religious authority has framed an existing conflict as a defence of its followers against an outside religious enemy. This strengthens mobilisation and legitimacy for the favoured ruler, but does not compel other states to join.'],
    religious_seat_occupied:['Sacred seat occupied','The authority’s sacred seat has been occupied by another political actor. The authority survives as a transnational institution, but its prestige and practical freedom are damaged.'],
    religious_authority_relocated:['Religious administration relocates','Prolonged occupation has forced the authority to move its working administration to another major centre of followers. Its original sacred seat still matters symbolically.'],
    religious_seat_restored:['Sacred seat restored','The autonomous sacred seat is again under the religious authority’s control. The transnational institution returns from its administrative refuge rather than being recreated from scratch.'],
  }[event.type];
  title.textContent = copy?.[0] || 'Religious politics'; body.textContent = copy?.[1] || 'A religious institution has changed the political balance.';
  continueOnly(); return true;
}
