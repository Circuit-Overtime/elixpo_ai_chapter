'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import StyledQr, { type StyledQrHandle } from '@/app/components/qr/StyledQr';
import {
  buildQrOptions,
  DEFAULT_PRESET_ID,
  getPreset,
  QR_PRESETS,
} from '@/lib/qr/presets';

interface AccountState {
  loaded: boolean;
  loggedIn: boolean;
  tier: string;
  presetLimit: number;
  allowLogo: boolean;
}

interface TrackedResult {
  short_url: string;
  short_code: string;
}

type ExportFormat = 'svg' | 'png' | 'jpeg';

const BASIC_PRESET_LIMIT = 3;
const QR_SIZE = 1024;

function normalizeWebUrl(value: string): string | null {
  try {
    const input = value.trim();
    if (!input) return null;
    const hasWebScheme = /^https?:\/\//i.test(input);
    const hasOtherScheme = /^[a-z][a-z\d+.-]*:/i.test(input)
      && !/^[a-z\d.-]+:\d+(?:[/?#]|$)/i.test(input);
    if (!hasWebScheme && hasOtherScheme) return null;
    const withScheme = hasWebScheme ? input : `https://${input}`;
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function qrFilename(value: string): string {
  const url = new URL(value);
  const source = `${url.hostname.replace(/^www\./i, '')}${url.pathname === '/' ? '' : `-${url.pathname}`}`;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
    .replace(/-$/g, '');
  return `lixrl-qr-${slug || 'link'}`;
}

export default function QrGenerator() {
  const [destination, setDestination] = useState('');
  const [qrData, setQrData] = useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [logoUrl, setLogoUrl] = useState('');
  const [trackScans, setTrackScans] = useState(false);
  const [trackedResult, setTrackedResult] = useState<TrackedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('svg');
  const [account, setAccount] = useState<AccountState>({
    loaded: false,
    loggedIn: false,
    tier: 'free',
    presetLimit: BASIC_PRESET_LIMIT,
    allowLogo: false,
  });
  const qrRef = useRef<StyledQrHandle>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          tier?: string;
          limits?: { qrPresets?: number; qrLogo?: boolean };
        }>;
      })
      .then((data) => {
        if (!alive) return;
        setAccount({
          loaded: true,
          loggedIn: !!data,
          tier: data?.tier || 'free',
          presetLimit: data?.limits?.qrPresets ?? BASIC_PRESET_LIMIT,
          allowLogo: data?.limits?.qrLogo ?? false,
        });
      })
      .catch(() => {
        if (alive) {
          setAccount({
            loaded: true,
            loggedIn: false,
            tier: 'free',
            presetLimit: BASIC_PRESET_LIMIT,
            allowLogo: false,
          });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const paid = account.loggedIn && account.tier !== 'free';
  const options = useMemo(
    () =>
      buildQrOptions(getPreset(presetId), {
        data: qrData || 'https://lixrl.com',
        image: paid ? logoUrl : '',
        size: QR_SIZE,
      }),
    [logoUrl, paid, presetId, qrData],
  );

  const generate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setCopied(false);
    setImageCopied(false);
    setTrackedResult(null);

    // Read the submitted field: browser autofill may update the DOM without
    // firing the React change event that keeps destination state in sync.
    const submitted = new FormData(event.currentTarget).get('destination');
    const normalized = normalizeWebUrl(typeof submitted === 'string' ? submitted : destination);
    if (!normalized) {
      setError('Paste a valid website URL, such as example.com or https://example.com/page.');
      return;
    }
    setDestination(normalized);
    if (logoUrl && !normalizeWebUrl(logoUrl)) {
      setError('The logo must be a public http(s) image URL.');
      return;
    }

    if (!trackScans) {
      setGeneratedFor(normalized);
      setQrData(normalized);
      return;
    }
    if (!paid) {
      setError('Tracked QR codes require Pro or Business.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/qr/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, title: 'QR code destination' }),
      });
      const data = (await response.json().catch(() => null)) as
        | (TrackedResult & { error?: string })
        | { error?: string }
        | null;
      if (!response.ok || !data || !('short_url' in data)) {
        setError(data?.error || 'Could not create the tracked QR code.');
        return;
      }
      const result = data as TrackedResult;
      setTrackedResult(result);
      setGeneratedFor(normalized);
      setQrData(result.short_url);
    } catch {
      setError('Network error while creating the tracked QR code.');
    } finally {
      setBusy(false);
    }
  };

  const copyQrLink = async () => {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the QR destination.');
    }
  };

  const copyCompressedJpeg = async () => {
    setError('');
    setImageCopied(false);
    const success = await qrRef.current?.copyJpeg(0.82);
    if (success) {
      setImageCopied(true);
      window.setTimeout(() => setImageCopied(false), 1800);
    }
  };

  return (
    <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-stretch">
      <form
        onSubmit={generate}
        className="flex flex-col justify-center rounded-3xl border border-[#e3e3e3] bg-white p-5 shadow-[0_16px_45px_rgba(0,0,0,0.06)] md:p-8"
      >
        <label htmlFor="qr-destination" className="text-sm font-bold text-[#222]">
          Link to turn into a QR code
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="qr-destination"
            name="destination"
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="https://example.com/page"
            className="min-w-0 flex-1 rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-sm text-[#111] outline-none transition-colors placeholder:text-[#999] focus:border-[#e53935]"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-[#e53935] to-[#c62828] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(229,57,53,0.22)] disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Generate QR code'}
          </button>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-[#222]">Choose a style</h2>
            {!paid && (
              <Link href="/pricing" className="text-xs font-semibold text-[#c62828] no-underline">
                Unlock every style →
              </Link>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {QR_PRESETS.map((preset, index) => {
              const locked = account.presetLimit !== -1 && index >= account.presetLimit;
              const selected = preset.id === presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={locked}
                  onClick={() => {
                    if (locked) {
                      setError('Upgrade to Pro to unlock every QR style.');
                      return;
                    }
                    setError('');
                    setPresetId(preset.id);
                  }}
                  className="group inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-left text-xs font-bold transition-all"
                  style={{
                    borderColor: selected ? '#e53935' : '#e1e1e1',
                    background: selected ? '#fff6f5' : '#ffffff',
                    color: locked ? '#888' : '#222',
                    boxShadow: selected ? '0 0 0 2px rgba(229,57,53,0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span
                    className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-black/10"
                    style={{ background: preset.swatch, opacity: locked ? 0.55 : 1 }}
                    aria-hidden="true"
                  >
                    <span className="absolute inset-[6px] rounded-[2px] border-2 border-white/90" />
                  </span>
                  <span>{preset.name}</span>
                  {locked && <span className="rounded-full bg-[#f1f1f1] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#777]">Pro</span>}
                  {selected && !locked && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e53935] text-[10px] text-white" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#e5e5e5] bg-[#fcfcfc] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-[#222]">Center logo</div>
              {!account.allowLogo && <span className="rounded-full bg-[#f5f5f5] px-2 py-1 text-[10px] font-bold text-[#777]">PRO</span>}
            </div>
            {account.allowLogo ? (
              <input
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://site.com/logo.png"
                className="mt-2 w-full rounded-lg border border-[#dddddd] px-3 py-2 text-xs outline-none focus:border-[#e53935]"
              />
            ) : (
              <Link href="/pricing" className="mt-2 inline-flex text-xs font-semibold text-[#c62828] no-underline">
                Unlock logo →
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-[#e5e5e5] bg-[#fcfcfc] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-[#222]">Scan analytics</div>
              {!paid && <span className="rounded-full bg-[#f5f5f5] px-2 py-1 text-[10px] font-bold text-[#777]">PAID</span>}
            </div>
            {paid ? (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#444]">
                <input
                  type="checkbox"
                  checked={trackScans}
                  onChange={(event) => setTrackScans(event.target.checked)}
                  className="h-4 w-4 accent-[#e53935]"
                />
                Create a tracked Lixrl link
              </label>
            ) : (
              <Link
                href={account.loggedIn ? '/pricing' : '/api/auth/login?return_to=%2Fgenerate'}
                className="mt-2 inline-flex text-xs font-semibold text-[#c62828] no-underline"
              >
                {account.loggedIn ? 'Upgrade for scan analytics →' : 'Sign in to view options →'}
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-[#efb8b5] bg-[#fff6f5] px-4 py-3 text-sm text-[#a82420]" role="alert">
            {error}
          </div>
        )}
      </form>

      <aside className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center lg:h-full lg:max-h-[560px] lg:min-h-0 lg:self-start lg:overflow-y-auto">
        {qrData ? (
          <>
            <div className="rounded-2xl bg-white p-3 shadow-[0_12px_35px_rgba(0,0,0,0.10)]">
              <StyledQr
                ref={qrRef}
                options={options}
                display={260}
                filename={qrFilename(generatedFor || qrData)}
                onError={setError}
              />
            </div>
            <p className="mt-5 max-w-sm break-all font-mono text-xs leading-5 text-[#777]">{qrData}</p>
            {trackedResult && (
              <Link
                href={`/dashboard/urls/${encodeURIComponent(trackedResult.short_code)}`}
                className="mt-2 text-xs font-semibold text-[#c62828] no-underline"
              >
                Open scan analytics →
              </Link>
            )}
            <div className="mt-5 flex w-full max-w-[520px] flex-col items-end gap-3">
              <div className="inline-flex rounded-xl border border-[#d8d8d8] bg-white p-1" aria-label="QR download format">
                {(['svg', 'png', 'jpeg'] as ExportFormat[]).map((format) => (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={exportFormat === format}
                    onClick={() => setExportFormat(format)}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase transition-colors"
                    style={{
                      background: exportFormat === format ? '#111' : 'transparent',
                      color: exportFormat === format ? '#fff' : '#666',
                    }}
                  >
                    {format === 'jpeg' ? 'JPG' : format}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => qrRef.current?.download(exportFormat)}
                  className="rounded-lg bg-[#111] px-4 py-2 text-xs font-bold text-white"
                >
                  Download {exportFormat === 'jpeg' ? 'JPG' : exportFormat.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={copyCompressedJpeg}
                  className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-xs font-bold text-[#333]"
                >
                  {imageCopied ? 'JPG copied' : 'Copy compressed JPG'}
                </button>
                <button type="button" onClick={copyQrLink} className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-xs font-bold text-[#333]">
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="max-w-xs">
            <div className="mx-auto grid h-20 w-20 grid-cols-3 gap-1 rounded-xl bg-white p-3 shadow-sm" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <span key={index} className="rounded-sm bg-[#222]" style={{ opacity: index === 4 ? 0.15 : 1 }} />
              ))}
            </div>
            <h2 className="mt-5 text-base font-bold">Your QR code appears here</h2>
          </div>
        )}
      </aside>
    </div>
  );
}
