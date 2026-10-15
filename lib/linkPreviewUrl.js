const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
  ) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const tail = normalized.slice('::ffff:'.length);
    if (tail.includes('.')) {
      if (tail.startsWith('127.') || tail.startsWith('10.') || tail.startsWith('169.254.') || tail.startsWith('192.168.') || tail.startsWith('172.16.')) {
        return true;
      }
      return isPrivateIpv4(tail);
    }
    const groups = tail.split(':').filter(Boolean);
    if (groups.length <= 2) {
      const hex = groups.map((g) => g.padStart(4, '0')).join('');
      const octets = [];
      for (let i = 0; i < 8; i += 2) {
        const byte = parseInt(hex.slice(i, i + 2), 16);
        if (!Number.isInteger(byte)) return true;
        octets.push(byte);
      }
      return isPrivateIpv4(octets.join('.'));
    }
    return true;
  }
  return false;
}

export function isSafePreviewUrl(value) {
  let parsed;
  try {
    parsed = value instanceof URL ? value : new URL(value);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return false;
  }

  return !isPrivateIpv4(hostname) && !isPrivateIpv6(hostname);
}

export function resolvePreviewAsset(value, documentUrl) {
  if (!value) return '';
  try {
    const resolved = new URL(value, documentUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.href : '';
  } catch {
    return '';
  }
}
