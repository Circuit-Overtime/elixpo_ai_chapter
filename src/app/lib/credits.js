import plansConfig from './plans.json';

export const DAILY_CREDITS = plansConfig.dailyCredits;
export const IMAGE_COSTS = plansConfig.costs.image;
export const VIDEO_COSTS = plansConfig.costs.video;
export const EDIT_COST = plansConfig.costs.edit;
export const ENHANCE_COST = plansConfig.costs.enhance;
export const DESCRIBE_COST = plansConfig.costs.describe;
export const BLUEPRINT_EXTRA = plansConfig.costs.blueprintExtra;
export const PLANS = plansConfig.plans;

export function getImageCost(model) {
  return IMAGE_COSTS[model] || 3;
}

export function getVideoCost(model) {
  return VIDEO_COSTS[model] || 12;
}

export function getCost(action, model) {
  switch (action) {
    case 'image':    return getImageCost(model);
    case 'video':    return getVideoCost(model);
    case 'edit':     return EDIT_COST;
    case 'enhance':  return ENHANCE_COST;
    case 'describe': return DESCRIBE_COST;
    case 'blueprint': return (IMAGE_COSTS[model] || VIDEO_COSTS[model] || 4) + BLUEPRINT_EXTRA;
    default:         return 3;
  }
}

export function getDailyCredits(tier) {
  return DAILY_CREDITS[tier] || DAILY_CREDITS.guest;
}
