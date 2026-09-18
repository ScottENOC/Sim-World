from pathlib import Path

# Clean the already-integrated employment layer and remove stale protectionism
# variables left behind after protectionism moved wholly into tradePolicy.js.
p=Path('js/economy/employmentAndHardship.js')
s=p.read_text()
s=s.replace("  const protectionJobs=clamp(region.labourRelations?.protectionJobs||0);\n", "")
s=s.replace("+hiringPenalty-protectionJobs", "+hiringPenalty")
s=s.replace(",protectionJobs};", "};")
s=s.replace("  const protectionCost=clamp(region.labourRelations?.protectionCost||0);\n", "")
s=s.replace("+protectionCost*0.08", "")
s=s.replace(",protectionCost};", "};")
s=s.replace(",protectionCost:h.protectionCost", "")
p.write_text(s)

# Building standards are beneficial for safety/quality but not free: tighter
# standards raise the marginal cost/rent pressure of housing supply.
p=Path('js/society/urbanHousing.js')
s=p.read_text()
s=s.replace(
"  const rentPressure=clamp(shortage*0.55+blocked*0.15+urbanShare*0.22+rapidGrowth*0.18-Math.max(0,vacancy)/population*4);\n  const standards=s.buildingStandards;\n",
"  const standards=s.buildingStandards;\n  const rentPressure=clamp(shortage*0.55+blocked*0.15+urbanShare*0.22+rapidGrowth*0.18+standards*urbanShare*0.10-Math.max(0,vacancy)/population*4);\n")
p.write_text(s)
