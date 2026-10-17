import registry from './themes.json' with { type: 'json' };

function annualDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${month}-${day}`;
}

export function isSeasonalThemeActive(theme, date = new Date()) {
  const schedule = theme?.schedule;
  if (!schedule || schedule.type !== 'annual') return false;

  const current = annualDateKey(date, schedule.timeZone || 'UTC');
  const { start, end = start } = schedule;
  if (!/^\d{2}-\d{2}$/.test(start || '') || !/^\d{2}-\d{2}$/.test(end || '')) return false;

  // Ranges such as 12-30 → 01-02 intentionally wrap across the year boundary.
  return start <= end
    ? current >= start && current <= end
    : current >= start || current <= end;
}

export function getActiveSeasonalTheme(date = new Date()) {
  return [...registry.themes]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .find((theme) => isSeasonalThemeActive(theme, date)) || null;
}

export function seasonalThemeBootstrapScript() {
  const themes = JSON.stringify(registry.themes).replaceAll('<', '\\u003c');
  return `(function(){try{var themes=${themes};var now=new Date();var root=document.documentElement;var active=themes.sort(function(a,b){return (b.priority||0)-(a.priority||0)}).find(function(theme){var s=theme.schedule;if(!s||s.type!=='annual')return false;var p=new Intl.DateTimeFormat('en-US',{timeZone:s.timeZone||'UTC',month:'2-digit',day:'2-digit'}).formatToParts(now);var m=p.find(function(x){return x.type==='month'}).value;var d=p.find(function(x){return x.type==='day'}).value;var key=m+'-'+d;var end=s.end||s.start;return s.start<=end?(key>=s.start&&key<=end):(key>=s.start||key<=end)});if(active){root.setAttribute('data-seasonal-theme',active.id);var p=active.palette||{};root.style.setProperty('--seasonal-primary',p.primary||'');root.style.setProperty('--seasonal-primary-hover',p.primaryHover||p.primary||'');root.style.setProperty('--seasonal-secondary',p.secondary||'');root.style.setProperty('--seasonal-focus',p.focus||p.primary||'')}else root.removeAttribute('data-seasonal-theme')}catch(e){}})();`;
}

export { registry as seasonalThemeRegistry };
