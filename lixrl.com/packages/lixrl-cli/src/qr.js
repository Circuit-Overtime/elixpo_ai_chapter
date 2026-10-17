import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { emit, EXIT_CODES } from './contract.js';

const PRESETS = [
  ['classic', 'square', 'square', 'square', { color: '#0b0d12' }, '#ffffff'],
  ['rounded', 'rounded', 'extra-rounded', 'dot', { color: '#5b3df5' }, '#ffffff'],
  ['dots', 'dots', 'dot', 'dot', { color: '#7c5cff' }, '#ffffff'],
  ['classy', 'classy', 'square', 'square', { color: '#111827' }, '#ffffff'],
  ['aurora', 'extra-rounded', 'extra-rounded', 'dot', { gradient: gradient('#9b7bf7', '#5fb6ff') }, '#ffffff'],
  ['inverse', 'rounded', 'extra-rounded', 'dot', { color: '#ffffff' }, '#0b0d12'],
  ['sunset', 'extra-rounded', 'extra-rounded', 'dot', { gradient: gradient('#ff8a5c', '#ff3d77') }, '#ffffff'],
  ['forest', 'classy-rounded', 'extra-rounded', 'square', { gradient: gradient('#34d399', '#0ea5e9') }, '#ffffff'],
];

function gradient(...colors) {
  return { type: 'linear', rotation: Math.PI / 4, colorStops: colors.map((color, index) => ({ offset: index, color })) };
}

function invalid(message) {
  throw Object.assign(new Error(message), { code: 'invalid_usage', exitCode: EXIT_CODES.USAGE });
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    invalid('QR data must be a complete http:// or https:// URL.');
  }
}

async function logoData(value) {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  const extension = path.extname(value).slice(1).toLowerCase();
  const mime = extension === 'svg' ? 'image/svg+xml' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${(await readFile(value)).toString('base64')}`;
}

export function qrRequiresLogin(options = {}) {
  const style = options.style || 'rounded';
  return !!options.track || !!options.logo || PRESETS.findIndex(([id]) => id === style) > 2;
}

export function validateQrInvocation(destination, options = {}) {
  const presetIndex = PRESETS.findIndex(([id]) => id === (options.style || 'rounded'));
  if (presetIndex < 0) invalid(`Unknown QR style. Choose: ${PRESETS.map(([id]) => id).join(', ')}.`);
  const data = normalizeUrl(destination);
  const format = (options.format || 'svg').toLowerCase().replace('jpg', 'jpeg');
  if (!['svg', 'png', 'jpeg'].includes(format)) invalid('QR format must be svg, png, jpg, or jpeg.');
  const size = Number(options.size || 1024);
  if (!Number.isSafeInteger(size) || size < 128 || size > 4096) invalid('QR size must be an integer from 128 to 4096 pixels.');
  const output = options.output || `lixrl-qr.${format === 'jpeg' ? 'jpg' : format}`;
  if (existsSync(output) && !(options.force && options.yes)) invalid(`Refusing to overwrite ${output}. Pass --force --yes to replace it.`);
  return { presetIndex, data, format, size, output };
}

export async function runQr(client, destination, options, renderTask = (task) => task()) {
  const validated = validateQrInvocation(destination, options);
  const { presetIndex, format, size, output } = validated;
  let { data } = validated;
  if (qrRequiresLogin(options)) {
    if (!client) throw Object.assign(new Error('This QR option requires login. Run lixrl login.'), { code: 'login_required', exitCode: 4 });
    const account = await client.me();
    const presetLimit = account.limits?.qrPresets ?? 3;
    if (presetLimit !== -1 && presetIndex >= presetLimit) invalid('This QR style is not included in the active plan.');
    if (options.logo && !account.limits?.qrLogo) invalid('Center logos are not included in the active plan.');
    if (options.track) {
      const tracked = await client.request('/api/qr/track', {
        method: 'POST', body: { url: data, title: options.title || 'Tracked QR code' },
      });
      data = tracked.short_url;
    }
  }

  await renderTask(async () => {
    const [{ default: QRCodeStyling }, { JSDOM }, nodeCanvas] = await Promise.all([
      import('qr-code-styling'), import('jsdom'), import('@napi-rs/canvas'),
    ]);
    const [, dotsType, squareType, dotType, paint, background] = PRESETS[presetIndex];
    const corner = paint.gradient ? paint.gradient.colorStops[0].color : paint.color;
    const qr = new QRCodeStyling({
      width: size, height: size, type: format === 'svg' ? 'svg' : 'canvas', data, margin: 8,
      jsdom: JSDOM, nodeCanvas, image: await logoData(options.logo),
      qrOptions: { errorCorrectionLevel: 'H' },
      dotsOptions: { type: dotsType, ...paint },
      cornersSquareOptions: { type: squareType, color: corner },
      cornersDotOptions: { type: dotType, color: corner },
      backgroundOptions: { color: background },
      imageOptions: { margin: 6, imageSize: 0.4, hideBackgroundDots: true, saveAsBlob: true },
    });
    const rendered = await qr.getRawData(format);
    if (!rendered) throw new Error('QR renderer returned no data.');
    await writeFile(output, Buffer.from(rendered));
  });
  emit({ output, format, style: PRESETS[presetIndex][0], size, data, tracked: !!options.track }, options, 'QR code saved');
}

export const QR_STYLES = PRESETS.map(([id]) => id);
