from pathlib import Path
p = Path('js/ui/advisors.js')
s = p.read_text()
start = s.index("    const stewardVoice = '<p class=\"advisor-voice\">")
end = s.index("\n  renderEnvoy(player) {", start)
replacement = '''    const stewardVoice = '<p class="advisor-voice">“The realm is more than its warriors. These are the people, harvests and dangers that will still matter next winter.”</p>';

    let constructionHtml = '';
    if (active && type) {
      const projectName = active.kind === 'repair' ? 'Repair ' + type.name : type.name;
      const percentDone = Math.round(progress * 100);
      const materialRows = Object.entries(requiredMaterials).map(([resource, required]) => {
        const label = resource.charAt(0).toUpperCase() + resource.slice(1) + ' used';
        return row(label, number(active.materialsUsed[resource]) + ' / ' + number(required));
      }).join('');
      const weeksRemaining = Math.ceil((requiredWork - active.workDone) / Math.max(1, active.targetWorkers));
      const statusText = active.stalledReason || (weeksRemaining + ' weeks remaining at the ordered workforce, if coin and materials remain available.');
      constructionHtml =
        '<div class="construction-project"><strong>' + projectName + '</strong><span>' + percentDone + '%</span>' +
        '<div class="construction-progress"><i style="width:' + percentDone + '%"></i></div></div>' +
        row('Work completed', number(active.workDone) + ' / ' + number(requiredWork) + ' worker-weeks') +
        row('Builders this week', number(active.workersThisWeek)) +
        materialRows +
        '<label class="advisor-field advisor-slider"><span>Assigned builders <b id="builder-count-label">' + number(active.targetWorkers) + '</b></span>' +
        '<input id="construction-workers" data-project-id="' + active.id + '" type="range" min="' + type.minWorkers + '" max="' + type.maxWorkers + '" step="5" value="' + active.targetWorkers + '"></label>' +
        '<p class="advisor-note">' + statusText + '</p>' +
        '<button class="advisor-order danger" data-cancel-project="' + active.id + '">Cancel project</button>';
    } else if (available.length) {
      const options = available.map((item) => '<option value="' + item.id + '">' + item.name + '</option>').join('');
      constructionHtml =
        '<label class="advisor-field"><span>Project</span><select id="construction-type">' + options + '</select></label>' +
        '<label class="advisor-field advisor-slider"><span>Assigned builders <b id="new-builder-count-label">100</b></span>' +
        '<input id="new-construction-workers" type="range" min="25" max="400" step="5" value="100"></label>' +
        '<div id="construction-estimate" class="advisor-note"></div>' +
        '<button id="start-construction" class="advisor-order">Commission project</button>';
    } else {
      constructionHtml = '<p class="advisor-note">No known project is available. New forms of construction emerge through need, accumulated skill and contact with other builders.</p>';
    }

    let infrastructureHtml = '';
    if (construction.assets.length) {
      infrastructureHtml = construction.assets.map((asset) => {
        const assetType = CONSTRUCTION_TYPES[asset.typeId];
        const condition = Math.round((asset.condition || 0) * 100);
        const tone = condition < 50 ? ' warning' : '';
        const state = condition <= 20 ? 'disabled' : asset.maintenanceRatio < .95 ? 'under-maintained' : 'operational';
        const repairButton = condition < 100 && !active
          ? '<button class="advisor-order" data-repair-asset="' + asset.id + '">Repair ' + (assetType?.name || 'infrastructure') + '</button>'
          : '';
        return '<div class="advisor-report-row' + tone + '"><span>' + (assetType?.name || asset.typeId) + '</span><strong>' + condition + '% · ' + state + '</strong></div>' + repairButton;
      }).join('') + '<p class="advisor-note">Maintenance is paid automatically. If labour, materials or treasury funds are unavailable, condition and benefits decline.</p>';
    }

    return stewardVoice +
      section('Realm at home', row('Population', number(player.population)) + row('Stability', percent(player.stability), player.stability < .6 ? 'warning' : '') + row('Safety', percent(player.safetyRating), player.safetyRating < .6 ? 'warning' : '') + row('Bandits', number(player.banditPopulation), player.banditPopulation > 50 ? 'warning' : '') + row('Food stores', number(food))) +
      section('This season', row('Weather', player.weather?.condition || 'normal') + row('Crop yield effect', percent(player.weather?.yieldMultiplier ?? 1)) + row('Food import dependence', percent(player.foodImportDependence || player.report?.foodPlan?.importDependence || 0))) +
      section('Public education', educationSection) +
      section('Construction', constructionHtml) +
      (infrastructureHtml ? section('Infrastructure condition', infrastructureHtml) : '');
  }
'''
s = s[:start] + replacement + s[end:]
p.write_text(s)
