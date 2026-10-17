'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  buildQrOptions,
  getPreset,
  QR_PRESETS,
} from '@/lib/qr/presets';
import StyledQr, { type StyledQrHandle } from '@/app/components/qr/StyledQr';

interface Props {
  shortUrl: string;
  filename: string;
  presetId: string;
  onPresetChange: (id: string) => void;
  logoUrl: string;
  onLogoChange: (url: string) => void;
  /** Presets unlocked by the tier (-1 = all). */
  presetLimit: number;
  /** Whether the tier can add a logo. */
  allowLogo: boolean;
}

const ACCENT = '#e53935';

export default function QrStudio({
  shortUrl,
  filename,
  presetId,
  onPresetChange,
  logoUrl,
  onLogoChange,
  presetLimit,
  allowLogo,
}: Props) {
  const [logoDraft, setLogoDraft] = useState(logoUrl);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<StyledQrHandle>(null);

  const preset = getPreset(presetId);
  const mainOptions = useMemo(
    () => buildQrOptions(preset, { data: shortUrl, image: logoUrl, size: 1024 }),
    [preset, shortUrl, logoUrl],
  );

  const applyLogo = () => {
    const v = logoDraft.trim();
    if (v && !/^https?:\/\/.+/i.test(v)) {
      setError('Logo must be a public http(s) URL to a .png image.');
      return;
    }
    setError(null);
    onLogoChange(v);
  };

  const download = async () => {
    setError(null);
    await qrRef.current?.download();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Preview + downloads */}
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        <div
          className="rounded-xl shrink-0 flex items-center justify-center"
          style={{
            width: 236,
            height: 236,
            padding: 8,
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(229,57,53,0.18)',
          }}
        >
          <StyledQr ref={qrRef} options={mainOptions} display={220} filename={filename} onError={setError} />
        </div>

        <div className="flex-1 w-full flex flex-col gap-3">
          {/* Logo URL */}
          <div>
            <label className="text-[0.7rem] uppercase tracking-wider text-white/45 font-semibold">
              Logo image URL
            </label>
            {allowLogo ? (
              <>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://yoursite.com/logo.png"
                    value={logoDraft}
                    onChange={(e) => setLogoDraft(e.target.value)}
                    onBlur={applyLogo}
                    onKeyDown={(e) => e.key === 'Enter' && applyLogo()}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm text-white bg-transparent outline-none"
                    style={{ border: '1px solid rgba(0,0,0,0.14)' }}
                  />
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoDraft('');
                        onLogoChange('');
                        setError(null);
                      }}
                      className="px-3 py-2 rounded-lg text-sm text-white/70 cursor-pointer bg-transparent"
                      style={{ border: '1px solid rgba(0,0,0,0.14)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[0.72rem] text-white/40 mt-1.5 leading-relaxed">
                  Paste a public PNG URL — we don&apos;t host images. The QR always
                  exports as a vector SVG.
                </p>
              </>
            ) : (
              <Link
                href="/pricing"
                className="mt-1.5 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg no-underline group"
                style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.25)' }}
              >
                <span className="text-[0.8rem] text-white/75">
                  🔒 Add your own logo with <strong className="text-white">Pro</strong>
                </span>
                <span className="text-[0.78rem] font-semibold" style={{ color: '#c62828' }}>
                  Upgrade →
                </span>
              </Link>
            )}
          </div>

          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5' }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-2 mt-auto">
            <button
              type="button"
              onClick={download}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
              style={{ background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)', boxShadow: '0 4px 14px rgba(229,57,53,0.35)' }}
            >
              Download SVG
            </button>
          </div>
        </div>
      </div>

      {/* Style catalog */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[0.7rem] uppercase tracking-wider text-white/45 font-semibold">
            Style
          </div>
          {presetLimit !== -1 && (
            <Link href="/pricing" className="text-[0.7rem] font-semibold no-underline" style={{ color: '#c62828' }}>
              Unlock all styles →
            </Link>
          )}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
          {QR_PRESETS.map((p, i) => {
            const locked = presetLimit !== -1 && i >= presetLimit;
            const selected = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  locked
                    ? setError('Upgrade to Pro to unlock the full style catalog.')
                    : onPresetChange(p.id)
                }
                title={locked ? `${p.name} — Pro` : p.name}
                aria-disabled={locked}
                className="relative flex flex-col items-center gap-1.5 p-2 rounded-xl cursor-pointer transition-all bg-transparent"
                style={{
                  border: selected ? `1px solid ${ACCENT}` : '1px solid rgba(0,0,0,0.10)',
                  background: selected ? 'rgba(229,57,53,0.1)' : 'transparent',
                }}
              >
                <div className="relative" style={{ opacity: locked ? 0.4 : 1 }}>
                  <ThumbQr preset={p} data={shortUrl} />
                  {locked && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 018 0v4" />
                      </svg>
                    </span>
                  )}
                </div>
                <span
                  className="text-[0.62rem] font-medium truncate w-full text-center"
                  style={{ color: locked ? 'rgba(0,0,0,0.4)' : selected ? '#c62828' : 'rgba(0,0,0,0.6)' }}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Small catalog thumbnail — its own lightweight instance (no logo). */
function ThumbQr({ preset, data }: { preset: (typeof QR_PRESETS)[number]; data: string }) {
  const options = useMemo(
    () => buildQrOptions(preset, { data, size: 160 }),
    [preset, data],
  );
  return (
    <div
      className="rounded-md overflow-hidden flex items-center justify-center"
      style={{ width: 52, height: 52, background: '#fff', padding: 3 }}
    >
      <StyledQr options={options} display={46} />
    </div>
  );
}
