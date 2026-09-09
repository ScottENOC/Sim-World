from pathlib import Path

p = Path('js/ui/advisors.js')
text = p.read_text()
anchor = "import { sendDeceptionJointOperationLetter, sendForgedJointOperationLetter } from '../diplomacy/couriers.js?v=20260909-counterintel1';"
if "calendarWeekIndex" not in text:
    text = text.replace(anchor, anchor + "\nimport { calendarWeekIndex } from '../core/simTime.js?v=20260905-time2';", 1)
text = text.replace("dispatchDiplomat(player, target, this.regions, button.dataset.dispatchDiplomat, this.clock.tickIndex);",
                    "dispatchDiplomat(player, target, this.regions, button.dataset.dispatchDiplomat, calendarWeekIndex(this.clock.elapsedDays || 0));")
text = text.replace("recallDiplomat(player, button.dataset.recallDiplomat, this.regions, this.clock.tickIndex);",
                    "recallDiplomat(player, button.dataset.recallDiplomat, this.regions, calendarWeekIndex(this.clock.elapsedDays || 0));")
text = text.replace("const result = sendDeceptionJointOperationLetter(player, recipient, enemy, this.regions, this.clock.tickIndex, { attackTick: this.clock.tickIndex + Math.round(months * 4.345), secrecy: .12 });",
                    "const currentWeek = calendarWeekIndex(this.clock.elapsedDays || 0);\n      const result = sendDeceptionJointOperationLetter(player, recipient, enemy, this.regions, currentWeek, { attackTick: currentWeek + Math.round(months * 4.345), secrecy: .12 });")
text = text.replace("const result = sendForgedJointOperationLetter(player, purported, recipient, enemy, this.regions, this.clock.tickIndex, { attackTick: this.clock.tickIndex + 13 });",
                    "const currentWeek = calendarWeekIndex(this.clock.elapsedDays || 0);\n      const result = sendForgedJointOperationLetter(player, purported, recipient, enemy, this.regions, currentWeek, { attackTick: currentWeek + 13 });")
p.write_text(text)
