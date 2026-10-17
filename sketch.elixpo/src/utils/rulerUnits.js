export const RULER_UNITS = ['px', 'cm', 'in']

const PIXELS_PER_UNIT = { px: 1, cm: 96 / 2.54, in: 96 }

export function normalizeRulerUnit(unit) {
  return RULER_UNITS.includes(unit) ? unit : 'px'
}

export function convertRulerValue(pixelValue, unit = 'px') {
  return pixelValue / PIXELS_PER_UNIT[normalizeRulerUnit(unit)]
}

export function formatRulerValue(pixelValue, unit = 'px', suffix = false) {
  const normalized = normalizeRulerUnit(unit)
  const converted = convertRulerValue(pixelValue, normalized)
  let label
  if (normalized === 'px') {
    const rounded = Math.round(converted)
    const absolute = Math.abs(rounded)
    if (absolute >= 1000000) label = `${Number((rounded / 1000000).toFixed(1))}m`
    else if (absolute >= 10000) label = `${Number((rounded / 1000).toFixed(1))}k`
    else label = String(rounded)
  } else {
    const precision = Math.abs(converted) < 10 ? 2 : Math.abs(converted) < 100 ? 1 : 0
    label = String(Number(converted.toFixed(precision)))
  }
  return suffix ? `${label} ${normalized}` : label
}
