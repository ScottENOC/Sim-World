// Map-first mobile UI.
//
// Region selection should focus the map, not replace it with a large bottom
// sheet. The legacy region controls/details remain in the DOM for now so no
// gameplay mechanics are deleted while their remaining actions migrate into
// advisors and map layers, but they are not part of the normal phone workflow.

function installMapFirstUi() {
  const sheet = document.getElementById('region-sheet');
  const name = document.getElementById('region-name');
  const controls = document.getElementById('region-controls');
  const details = document.getElementById('region-details');
  const handle = document.getElementById('region-sheet-handle');
  const close = document.getElementById('btn-close-sheet');
  if (!sheet || !name || !controls || !details || !close) return false;
  if (sheet.dataset.mapFirst === '1') return true;
  sheet.dataset.mapFirst = '1';

  const style = document.createElement('style');
  style.textContent = `
    /* Region selection is a focus state, not a modal information surface. */
    #region-sheet.sheet {
      left: 12px;
      right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom));
      width: auto;
      max-height: none;
      min-height: 52px;
      padding: 9px 52px 9px 14px;
      border: 1px solid var(--bronze-dim);
      border-radius: 11px;
      background: rgba(23,29,41,.92);
      overflow: visible;
      box-shadow: 0 5px 20px rgba(0,0,0,.25);
      transform: translateY(0);
      transition: opacity .15s ease, transform .15s ease;
      pointer-events: auto;
      z-index: 11;
    }
    #region-sheet.sheet.hidden {
      display: block;
      opacity: 0;
      transform: translateY(calc(100% + 24px));
      pointer-events: none;
    }
    #region-sheet-handle,
    #region-sheet #region-controls,
    #region-sheet #region-details {
      display: none !important;
    }
    #region-sheet #region-name {
      margin: 0;
      padding: 0;
      font-size: 15px;
      line-height: 20px;
      color: var(--parchment);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #region-sheet .map-focus-hint {
      display: block;
      margin-top: 2px;
      color: var(--parchment-dim);
      font-size: 11px;
      line-height: 15px;
    }
    #region-sheet #btn-close-sheet {
      top: 8px;
      right: 9px;
      width: 34px;
      height: 34px;
      background: rgba(16,20,28,.82);
    }
    /* Layers are now a primary interaction surface, so give them room on phones. */
    .legend {
      max-width: min(94vw, 430px);
      right: 14px;
      width: auto;
    }
    .layer-toggle {
      flex-wrap: wrap;
    }
    .layer-toggle > button {
      flex: 1 1 62px !important;
      min-width: 58px;
      min-height: 30px;
      font-size: 11px !important;
    }
    @media (max-width: 520px) {
      .legend {
        left: 10px;
        right: 10px;
        bottom: calc(78px + env(safe-area-inset-bottom));
        max-width: none;
      }
    }
  `;
  document.head.appendChild(style);

  if (handle) handle.setAttribute('aria-hidden', 'true');

  const hint = document.createElement('span');
  hint.className = 'map-focus-hint';
  hint.textContent = 'Selected · zoom to inspect · use layers or Council for detail and orders';
  name.insertAdjacentElement('afterend', hint);

  // The large controls/details are deliberately retained but inert here. This
  // lets us migrate any straggling action into the appropriate advisor without
  // deleting the underlying DOM/state in the same commit.
  controls.setAttribute('aria-hidden', 'true');
  details.setAttribute('aria-hidden', 'true');

  // A selected region should remain selected when the Council is opened. The
  // Council itself already hides the old sheet; closing it reveals the small
  // focus bar again on the next selection/draw rather than a large panel.
  const councilButton = document.getElementById('btn-council');
  councilButton?.setAttribute('title', 'Advisors, reports and orders');

  return true;
}

if (typeof window !== 'undefined') {
  installMapFirstUi();
  // index markup is synchronous, but keep one retry for unusual cached pages.
  if (!document.getElementById('region-sheet')) {
    document.addEventListener('DOMContentLoaded', installMapFirstUi, { once: true });
  }
}
