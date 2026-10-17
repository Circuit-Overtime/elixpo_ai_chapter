const ANSI = Object.freeze({
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  violet: "\u001b[38;5;141m",
  green: "\u001b[38;5;42m",
  yellow: "\u001b[38;5;220m",
  red: "\u001b[38;5;203m",
  gray: "\u001b[38;5;245m",
});

export function colorEnabled(stream = process.stdout, env = process.env) {
  return Boolean(stream.isTTY) && env.NO_COLOR === undefined && env.TERM !== "dumb";
}

function paint(value, code, enabled) {
  return enabled ? `${code}${value}${ANSI.reset}` : value;
}

export function loginChallenge({ url, code, expiresInSeconds, profile, interactive, color = false }) {
  const title = `${paint("◆", ANSI.violet, color)} ${paint("LixBlogs", ANSI.bold, color)}`;
  const instruction = interactive
    ? "Press Enter to open here, or use the URL on another device."
    : "Open the URL in any browser and approve this device.";
  return [
    "",
    `  ${title}`,
    `  ${paint("Device login", ANSI.dim, color)}`,
    "  ─────────────────────────────────────────",
    `  URL      ${url}`,
    `  Code     ${paint(code, ANSI.bold, color)}`,
    `  Expires  ${Math.ceil(expiresInSeconds / 60)} min`,
    profile
      ? `  Profile  ${profile} ${paint("(local credential slot)", ANSI.dim, color)}`
      : `  Profile  ${paint("your Accounts username after approval", ANSI.dim, color)}`,
    "",
    `  ${instruction}`,
    "  No localhost callback or exposed port is required.",
    "",
  ].join("\n");
}

export function successLine(message, color = false) {
  return `  ${paint(`✓ ${message}`, ANSI.green, color)}`;
}

export function warningLine(message, color = false) {
  return `  ${paint(`! ${message}`, ANSI.yellow, color)}`;
}

export function infoLine(message, color = false) {
  return `  ${paint(`• ${message}`, ANSI.gray, color)}`;
}

export function errorLine(message, color = false) {
  return `  ${paint(`✕ ${message}`, ANSI.red, color)}`;
}

const PROGRESS_FRAMES = Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);

export function startProgress(message, {
  stream = process.stderr,
  enabled = Boolean(stream.isTTY),
  intervalMs = 80,
  color = colorEnabled(stream),
} = {}) {
  if (!enabled) return { stop() {} };
  let frame = 0;
  const render = () => {
    stream.write(`\r\u001b[2K${paint(PROGRESS_FRAMES[frame], ANSI.violet, color)} ${paint(message, ANSI.gray, color)}`);
    frame = (frame + 1) % PROGRESS_FRAMES.length;
  };
  render();
  const timer = setInterval(render, intervalMs);
  timer.unref?.();
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      stream.write("\r\u001b[2K");
    },
  };
}

export async function withProgress(options, message, operation, settings = {}) {
  const progress = startProgress(message, {
    ...settings,
    enabled: settings.enabled ?? (!options?.json && !options?.quiet && Boolean((settings.stream || process.stderr).isTTY)),
  });
  try {
    return await operation();
  } finally {
    progress.stop();
  }
}

export function listenForEnter({ input = process.stdin, open, url }) {
  if (!input.isTTY || typeof open !== "function") return () => {};
  const onData = () => { Promise.resolve(open(url)).catch(() => {}); };
  input.setEncoding?.("utf8");
  input.once("data", onData);
  input.resume?.();
  return () => {
    input.off?.("data", onData);
    input.pause?.();
  };
}
