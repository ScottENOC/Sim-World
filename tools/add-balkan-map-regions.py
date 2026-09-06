import json
from pathlib import Path

path = Path('tools/map-region-plan.json')
plan = json.loads(path.read_text())
if any(c['iso'] == 'ALB' for c in plan['countries']):
    raise SystemExit('Balkan regions already present')

balkans = [
  {"iso":"ALB","displayCountry":"Albania","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Northern Albania","units":["Shkodër","Kukës","Lezhë","Dibër"]},
    {"name":"Central Albania","units":["Durrës","Tiranë","Elbasan","Berat"]},
    {"name":"Southern Albania","units":["Fier","Vlorë","Gjirokastër","Korçë"]}
  ]},
  {"iso":"MKD","displayCountry":"Macedonia","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Western Macedonia","units":["Polog","Southwest","Pelagonia","Skopje"]},
    {"name":"Eastern Macedonia","units":["Northeast","East","Vardar","Southeast"]}
  ]},
  {"iso":"BGR","displayCountry":"Bulgaria","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Western Bulgaria","units":["Vidin","Montana","Vratsa","Sofia","Sofia City","Pernik","Kyustendil","Blagoevgrad"]},
    {"name":"Northern Bulgaria","units":["Pleven","Lovech","Gabrovo","Veliko Tarnovo","Ruse","Razgrad","Shumen","Silistra","Dobrich","Varna","Targovishte"]},
    {"name":"Thrace","units":["Plovdiv","Pazardzhik","Stara Zagora","Sliven","Yambol","Haskovo","Kardzhali","Smolyan","Burgas"]}
  ]},
  {"iso":"SRB","displayCountry":"Serbia","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Vojvodina","units":["North Backa District","West Backa District","South Backa District","North Banat District","Central Banat District","South Banat District","Syrmia District"]},
    {"name":"Western Serbia","units":["Macva District","Kolubara District","Zlatibor District","Moravica District","Raska District"]},
    {"name":"Central Serbia","units":["Belgrade","Podunavlje District","Branicevo District","Pomoravlje District","Sumadija District","Rasina District"]},
    {"name":"Southern & Eastern Serbia","units":["Bor District","Zajecar District","Nisava District","Toplica District","Pirot District","Jablanica District","Pcinja District"]}
  ]},
  {"iso":"MNE","displayCountry":"Montenegro","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Montenegro","units":["Andrijevica Municipality","Bar Municipality","Berane Municipality","Bijelo Polje Municipality","Budva Municipality","Cetinje Municipality","Danilovgrad Municipality","Gusinje Municipality","Herceg Novi Municipality","Kolašin Municipality","Kotor Municipality","Mojkovac Municipality","Nikšić Municipality","Petnjica Municipality","Plav Municipality","Pljevlja Municipality","Plužine Municipality","Podgorica Municipality","Rožaje Municipality","Tivat Municipality","Ulcinj Municipality","Šavnik Municipality","Žabljak Municipality"]}
  ]},
  {"iso":"BIH","displayCountry":"Bosnia & Herzegovina","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Bosnia & Herzegovina","units":["Bosnian-Podrinje Canton Goražde","Brcko District","Canton 10","Central Bosnia Canton","Herzegovina-Neretva Canton","Posavina Canton","Republika Srpska","Sarajevo Canton","Tuzla Canton","Una-Sana Canton","West Herzegovina Canton","Zenica-Doboj Canton"]}
  ]},
  {"iso":"HRV","displayCountry":"Croatia","mode":"merge","requireAllSourceUnits":True,"regions":[
    {"name":"Istria & Kvarner","units":["Istria","Primorje-Gorski Kotar","Lika-Senj"]},
    {"name":"Dalmatia","units":["Zadar County","Šibenik-Knin","Split-Dalmatia","Dubrovnik-Neretva"]},
    {"name":"Slavonia","units":["Osijek-Baranja","Brod-Posavina","Požega-Slavonia","Virovitica-Podravina","Vukovar-Syrmia"]},
    {"name":"Inland Croatia","units":["Bjelovar-Bilogora","City of Zagreb","Karlovac","Koprivnica-Križevci","Krapina-Zagorje","Međimurje","Sisak-Moslavina","Varaždin","Zagreb County"]}
  ]}
]

# Insert before Anatolia so the plan remains roughly west-to-east.
insert_at = next(i for i,c in enumerate(plan['countries']) if c['iso'] == 'TUR')
plan['countries'][insert_at:insert_at] = balkans
plan['version'] = int(plan.get('version', 0)) + 1
path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
