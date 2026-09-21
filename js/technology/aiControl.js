const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const AI_ACCESS_DOMAINS=Object.freeze(['civilianDigital','industrial','infrastructure','military','nuclearCommand']);

export function ensureAiControlState(region){
  region.aiControl||={};
  const s=region.aiControl;
  for(const [key,value] of Object.entries({
    safetyMaturity:.08,evaluationMaturity:.05,containmentMaturity:.08,monitoringMaturity:.05,
    autonomy:0,capabilityGrowthRate:0,lossOfControlHazard:0,incidentPressure:0,lastCapability:0,
  }))if(!Number.isFinite(s[key]))s[key]=value;
  s.policy||={};
  for(const [key,value] of Object.entries({safetyInvestment:.35,deploymentCaution:.55,humanAuthorization:.85,incidentDisclosure:.55}))
    if(!Number.isFinite(s.policy[key]))s.policy[key]=value;
  s.access||={};
  for(const key of AI_ACCESS_DOMAINS)if(!Number.isFinite(s.access[key]))s.access[key]=0;
  return s;
}

export function setAiControlPolicy(region,patch={}){
  const s=ensureAiControlState(region);
  for(const key of ['safetyInvestment','deploymentCaution','humanAuthorization','incidentDisclosure']){
    if(patch[key]!==undefined)s.policy[key]=clamp(patch[key]);
  }
  return {...s.policy};
}

export function setAiAccess(region,domain,value){
  if(!AI_ACCESS_DOMAINS.includes(domain))throw new Error(`Unknown AI access domain ${domain}`);
  const s=ensureAiControlState(region);s.access[domain]=clamp(value);return s.access[domain];
}

function inferredAccess(region,s){
  const sectors=region.aiLabour?.sectors||{};
  const adoption=clamp(region.aiLabour?.adoption||0);
  const caution=clamp(s.policy.deploymentCaution);
  const civilian=clamp(Math.max(s.access.civilianDigital,adoption*(.35+.35*(sectors.services?.adoption||0))));
  const industrial=clamp(Math.max(s.access.industrial,adoption*(sectors.manufacturing?.adoption||0)*(.45+.35*(1-caution))));
  const infrastructure=clamp(Math.max(s.access.infrastructure,adoption*(sectors.logistics?.adoption||0)*(.22+.30*(1-caution))));
  const military=clamp(Math.max(s.access.military,Number(region.aiMilitaryIntegration)||0));
  const nuclearCommand=clamp(Math.max(s.access.nuclearCommand,Number(region.aiNuclearCommandIntegration)||0));
  return {civilianDigital:civilian,industrial,infrastructure,military,nuclearCommand};
}

function weightedAccess(a){
  return clamp(a.civilianDigital*.08+a.industrial*.17+a.infrastructure*.22+a.military*.23+a.nuclearCommand*.30);
}

export function tickAiControl(region,elapsedDays=7){
  const s=ensureAiControlState(region);
  const years=Math.max(.0001,(Number(elapsedDays)||0)/365.2425);
  const capability=clamp(region.aiLabour?.capability||region.aiEconomy?.capability||0);
  const adoption=clamp(region.aiLabour?.adoption||0);
  const research=region.aiLabour?.sectors?.research||{};
  const researchGain=clamp((research.productivityGain||0)*(research.outputClaim||0),0,.6);
  const competitivePressure=clamp(region.aiCompetitionPressure||region.strategicAiPressure||0);
  const growth=Math.max(0,(capability-s.lastCapability)/years);
  s.capabilityGrowthRate+=(growth-s.capabilityGrowthRate)*clamp(years*3);
  s.lastCapability=capability;

  const safetyInvestment=clamp(s.policy.safetyInvestment);
  const learning=years*(.035+.11*safetyInvestment+.08*researchGain)*(1-s.safetyMaturity);
  s.safetyMaturity=clamp(s.safetyMaturity+learning);
  s.evaluationMaturity=clamp(s.evaluationMaturity+years*(.025+.09*safetyInvestment+.06*researchGain)*(1-s.evaluationMaturity));
  s.containmentMaturity=clamp(s.containmentMaturity+years*(.020+.08*safetyInvestment)*(1-s.containmentMaturity));
  s.monitoringMaturity=clamp(s.monitoringMaturity+years*(.025+.07*s.policy.incidentDisclosure+.04*researchGain)*(1-s.monitoringMaturity));

  const caution=clamp(s.policy.deploymentCaution),human=clamp(s.policy.humanAuthorization);
  const autonomyTarget=clamp(capability*adoption*(.18+.42*competitivePressure+.25*(1-caution))*(1-human*.35));
  s.autonomy+=(autonomyTarget-s.autonomy)*clamp(years*1.8);

  const access=inferredAccess(region,s);
  s.access={...access};
  const accessWeight=weightedAccess(access);
  const control=clamp((s.safetyMaturity*.35+s.evaluationMaturity*.20+s.containmentMaturity*.25+s.monitoringMaturity*.20));
  const velocity=clamp(s.capabilityGrowthRate/1.5,0,1);
  const raw=capability*capability*(.10+.90*velocity)*s.autonomy*accessWeight/Math.max(.12,.20+control*1.55);
  s.lossOfControlHazard=clamp(raw,0,1);
  s.incidentPressure=clamp(s.incidentPressure+years*(s.lossOfControlHazard*.16-s.monitoringMaturity*.025-s.containmentMaturity*.018),0,1);

  region.report||={};region.report.aiControl=aiControlSummary(region);
  return s;
}

export function aiControlSummary(region){
  const s=ensureAiControlState(region);
  return {
    safetyMaturity:s.safetyMaturity,evaluationMaturity:s.evaluationMaturity,
    containmentMaturity:s.containmentMaturity,monitoringMaturity:s.monitoringMaturity,
    autonomy:s.autonomy,capabilityGrowthRate:s.capabilityGrowthRate,
    access:{...s.access},policy:{...s.policy},
    internal:{lossOfControlHazard:s.lossOfControlHazard,incidentPressure:s.incidentPressure},
  };
}
