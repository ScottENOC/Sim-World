import { CORPORATE_INFRASTRUCTURE_TYPES, createCorporateInfrastructureOffer, ensureCorporateInfrastructure, eligibleInfrastructureFirms, expireCorporateInfrastructureOffers, infrastructureTypeAvailable, proposeCorporateInfrastructure, tickCorporateInfrastructureAsset } from './corporateInfrastructure.js';
import { tickInvestmentReputation } from './infrastructureInvestment.js';
import { maybeNationaliseNpcInfrastructure, tickInfrastructureOwnership } from './infrastructureOwnership.js';
import { reviewNpcGovernmentEconomicPolicies } from './governmentEconomicPolicy.js';
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
function polityId(region){return region.governance?.sovereignPolityId||region.polityId||null;}
function hostRegions(regions,id){return regions.filter(r=>polityId(r)===id);}
function chooseHost(territories){return [...territories].filter(r=>(ensureCorporateInfrastructure(r).assets||[]).length<5).sort((a,b)=>{const ac=ensureCorporateInfrastructure(a).assets.length,bc=ensureCorporateInfrastructure(b).assets.length;return ac-bc||(b.population||0)-(a.population||0);})[0]||null;}
function typeDemand(type,region){const assets=ensureCorporateInfrastructure(region).assets;if(assets.some(a=>a.type===type&&a.status!=='destroyed'))return-1;const urban=clamp(Math.log1p(region.population||0)/12),trade=clamp(Math.log1p((region.tradeEconomy?.exportIncomeEma||0)+(region.tradeEconomy?.importSpendEma||0))/8);switch(type){case'port':return region.isCoastal ? .35+trade*.5 : -1;case'mine':return Object.keys(region.resourceDeposits||{}).length ? .25+Object.keys(region.resourceDeposits||{}).length*.04 : -1;case'steelworks':return .18+urban*.35;case'factory':return .2+urban*.45;case'canal':return .1+trade*.35;case'telegraph':return .12+trade*.4+urban*.2;case'power_generation':return .1+urban*.55;case'power_grid':return assets.some(a=>a.type==='power_generation'&&a.status!=='destroyed') ? .5+urban*.3 : .05;case'water_supply':return .15+urban*.55;default:return 0;}}
function defaultWarState(a,b){const ids=new Set([...(a?.atWarWith||[]),...(a?.enemiesAtWar||[])]);if(ids.has(b?.id))return true;return (a?.wars||[]).some(w=>w?.active!==false&&(w?.opponentId===b?.id||w?.participants?.includes?.(b?.id)));}
function destructionRisk(region){const assets=ensureCorporateInfrastructure(region).assets||[];if(!assets.length)return 0;return clamp(assets.reduce((s,a)=>s+(1-(a.condition??1)),0)/assets.length);}
export function tickExistingCorporateInfrastructure(regions,elapsedDays){for(const region of regions||[])for(const asset of ensureCorporateInfrastructure(region).assets||[]){tickCorporateInfrastructureAsset(asset,region,elapsedDays);tickInfrastructureOwnership(asset,region,elapsedDays);}}
export function maybeInvestInCorporateInfrastructure(regions,polities,currentTick,rng=Math.random,options={}){
  if(currentTick%52!==0)return[];
  const polityMap=new Map((polities||[]).map(p=>[p.id,p])),events=[],firmsByType=new Map();
  reviewNpcGovernmentEconomicPolicies(regions,polities,options.playerPolityId||null);
  if(currentTick>0)for(const polity of polities||[])tickInvestmentReputation(polity,1);
  events.push(...maybeNationaliseNpcInfrastructure(regions,polities,currentTick,options));
  for(const region of regions||[])expireCorporateInfrastructureOffers(region,currentTick);
  for(const type of Object.keys(CORPORATE_INFRASTRUCTURE_TYPES))firmsByType.set(type,eligibleInfrastructureFirms(regions,type).slice(0,24));
  for(const hostPolity of polities||[]){
    const host=chooseHost(hostRegions(regions,hostPolity.id));
    if(!host)continue;
    const types=Object.keys(CORPORATE_INFRASTRUCTURE_TYPES).map(type=>({type,demand:typeDemand(type,host)})).filter(x=>x.demand>0).sort((a,b)=>b.demand-a.demand);
    let placed=false;
    for(const{type,demand}of types){
      const candidates=(firmsByType.get(type)||[]).filter(c=>infrastructureTypeAvailable(type,host,c.region)).slice(0,8);
      for(const candidate of candidates){
        const investorPolity=polityMap.get(candidate.polityId);
        if(!investorPolity)continue;
        const foreign=investorPolity.id!==hostPolity.id,
          relation=options.relationResolver?.(hostPolity.id,investorPolity.id)??0,
          atWar=options.atWarResolver?.(hostPolity.id,investorPolity.id)??defaultWarState(hostPolity,investorPolity),
          partner=options.partnerResolver?.(hostPolity.id,investorPolity.id)??false,
          warLossRate=options.warLossRateResolver?.(hostPolity.id)??clamp(host.report?.conflict?.pressure||host.conflictPressure||0),
          civilDisorder=options.civilDisorderResolver?.(hostPolity.id)??clamp(1-(host.stability??1)),
          assetDamageRate=options.assetDamageRateResolver?.(hostPolity.id)??destructionRisk(host),
          appetite=clamp(.18+demand*.32+(candidate.firm.capitalIndex||0)*.015+(foreign?0:.12));
        if((rng?.()??Math.random())>appetite)continue;
        const concessionYears=25+Math.round((rng?.()??Math.random())*25);
        if(foreign&&options.playerPolityId===hostPolity.id){
          const offer=createCorporateInfrastructureOffer({type,hostRegion:host,hostPolity,investorRegion:candidate.region,investorPolity,firm:candidate.firm,relation,atWar,partner,warLossRate,civilDisorder,assetDamageRate,concessionYears,currentTick});
          if(offer.created){
            const infrastructureName=CORPORATE_INFRASTRUCTURE_TYPES[type]?.name||type.replaceAll('_',' ');
            events.push({type:'foreign_investment_offer',title:'Foreign investment proposal',description:`A company based in ${candidate.region.name} proposes a ${concessionYears}-year concession to build and operate a ${infrastructureName.toLowerCase()} in ${host.name}. Review the terms with the Treasurer in Council.`,polityId:hostPolity.id,hostPolityId:hostPolity.id,investorPolityId:investorPolity.id,regionId:host.id,proposalId:offer.proposal.id,infrastructureType:type,foreign:true});
            placed=true;
            break;
          }
          continue;
        }
        const result=proposeCorporateInfrastructure({type,hostRegion:host,hostPolity,investorRegion:candidate.region,investorPolity,firm:candidate.firm,relation,atWar,partner,warLossRate,civilDisorder,assetDamageRate,concessionYears});
        if(result.accepted){
          const built=result.asset;
          events.push({type:'corporate_infrastructure_investment',polityId:hostPolity.id,hostPolityId:hostPolity.id,investorPolityId:investorPolity.id,regionId:host.id,assetId:built.id,infrastructureType:type,foreign:built.foreignOwner});
          placed=true;
          break;
        }
      }
      if(placed)break;
    }
  }
  return events;
}
