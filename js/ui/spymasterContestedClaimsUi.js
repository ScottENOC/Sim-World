import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { renderContestedClaimsBrief } from './contestedClaimsBrief.js?v=20260922-contested-claims1';

export { renderContestedClaimsBrief } from './contestedClaimsBrief.js?v=20260922-contested-claims1';

const originalRenderSpymaster=AdvisorCouncil.prototype.renderSpymaster;
if(originalRenderSpymaster&&!AdvisorCouncil.prototype.__contestedClaimsUiPatched){
  AdvisorCouncil.prototype.__contestedClaimsUiPatched=true;
  AdvisorCouncil.prototype.renderSpymaster=function(player){
    const original=originalRenderSpymaster.call(this,player);
    return `${original}${renderContestedClaimsBrief(player)}`;
  };
}
