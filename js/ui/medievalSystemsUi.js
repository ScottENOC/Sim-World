function pct(v){ return `${Math.round((Number(v)||0)*100)}%`; }
function add(host,text){ const p=document.createElement('p'); p.className='save-status'; p.textContent=text; host.appendChild(p); }
function playerState(){ const w=window.__worldsim; if(!w?.activePlayerPolityId)return null; const p=w.polities?.find(x=>x.id===w.activePlayerPolityId); const r=p?w.regions?.find(x=>x.id===p.capitalRegionId):null; return p&&r?{w,p,r}:null; }
function topPath(paths={}){ return Object.entries(paths).sort((a,b)=>(b[1]||0)-(a[1]||0))[0]||['none',0]; }
function render(host){
  host.replaceChildren(); const h=document.createElement('h3'); h.textContent='Medieval institutions'; host.appendChild(h);
  const st=playerState(); if(!st){ add(host,'Choose a starting region first.'); return; }
  const {p,r}=st; const [path,value]=topPath(p.institutionalPaths);
  add(host,`Dominant state solution: ${path.replaceAll('_',' ')} ${pct(value)}. These paths are alternatives, not an era ladder.`);
  if(p.succession?.crisis) add(host,`Succession crisis: ${p.succession.crisis.contested?'contested':'managed'}${p.succession.crisis.claimantPolityId?` · claimant polity ${p.succession.crisis.claimantPolityId}`:''}.`);
  const s=r.medievalSociety||{}; const c=r.medievalCommerce||{}; const d=r.medievalDoctrine||{};
  add(host,`Capital society · guilds ${pct(s.urban?.guilds)} · civic council ${pct(s.urban?.council)} · landed elite power ${pct(s.estates?.hereditaryPower)}.`);
  add(host,`Education · religious schools ${pct(s.education?.religiousSchools)} · court schools ${pct(s.education?.courtSchools)} · examination service ${pct(s.education?.examinationService)} · urban academies ${pct(s.education?.urbanAcademies)}.`);
  add(host,`Finance · merchant credit ${pct(c.finance?.merchantCredit)} · deposit banking ${pct(c.finance?.depositBanking)} · state credit ${pct(c.finance?.stateCredit)} · bills of exchange ${pct(c.finance?.billsOfExchange)}.`);
  add(host,`Trade institutions · caravan network ${pct(c.trade?.caravanNetwork)} · merchant diaspora ${pct(c.trade?.merchantDiaspora)} · convoying ${pct(c.trade?.convoying)} · commercial law ${pct(c.trade?.commercialLaw)}.`);
  add(host,`Labour after mortality · scarcity ${pct(c.labour?.labourScarcity)} · wage pressure ${pct(c.labour?.wagePressure)} · bargaining power ${pct(c.labour?.bargainingPower)}.`);
  add(host,`Military doctrine · anti-cavalry ${pct(d.practice?.antiCavalry)} · cavalry shock ${pct(d.practice?.cavalryShock)} · combined arms ${pct(d.practice?.combinedArms)} · fortress depth ${pct(d.fortress?.siegeResistance)}.`);
}
function mount(){ const card=document.querySelector('#menu-modal .menu-card'); if(!card||document.getElementById('medieval-systems-menu'))return; const section=document.createElement('div'); section.id='medieval-systems-menu'; section.className='menu-section'; card.insertBefore(section,card.querySelector('.menu-section:last-of-type')); render(section); document.getElementById('btn-menu')?.addEventListener('click',()=>render(section)); }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0)); else setTimeout(mount,0);
