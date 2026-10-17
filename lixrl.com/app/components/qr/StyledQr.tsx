'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { CSSProperties } from 'react';
import type { Options } from 'qr-code-styling';

export interface StyledQrHandle {
  download: (extension?: 'svg' | 'png' | 'jpeg') => Promise<void>;
  copyJpeg: (quality?: number) => Promise<boolean>;
}

interface Props {
  options: Options;
  /** CSS display size in px (the canvas backbuffer comes from options.width). */
  display: number;
  filename?: string;
  className?: string;
  style?: CSSProperties;
  onError?: (message: string) => void;
}

/**
 * Renders a qr-code-styling instance. The library is browser-only (canvas /
 * DOMParser), so it's dynamically imported inside an effect — it never runs
 * during SSR on the Cloudflare edge. The canvas backbuffer stays at
 * options.width for crisp downloads while CSS scales it to `display`.
 */
const StyledQr = forwardRef<StyledQrHandle, Props>(function StyledQr(
  { options, display, filename = 'lixrl-qr', className, style, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qrRef = useRef<any>(null);

  // Create the instance once, then keep it updated below.
  useEffect(() => {
    let mounted = true;
    const container = containerRef.current;
    import('qr-code-styling')
      .then(({ default: QRCodeStyling }) => {
        if (!mounted || !container) return;
        qrRef.current = new QRCodeStyling(options);
        container.innerHTML = '';
        qrRef.current.append(container);
        // Force the appended node (svg) to fill the (smaller) display box.
        const el = container.querySelector('svg, canvas') as HTMLElement | null;
        if (el) {
          el.style.width = '100%';
          el.style.height = '100%';
          el.style.display = 'block';
        }
      })
      .catch(() => onError?.('QR renderer failed to load'));
    return () => {
      mounted = false;
      if (container) container.innerHTML = '';
    };
    // Create-once: later option changes go through the update effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    qrRef.current?.update(options);
  }, [options]);

  useImperativeHandle(
    ref,
    () => ({
      download: async (extension = 'svg') => {
        if (!qrRef.current) return;
        try {
          await Promise.resolve(qrRef.current.download({ name: filename, extension }));
        } catch {
          onError?.(`${extension.toUpperCase()} export failed — check the logo image URL is reachable.`);
        }
      },
      copyJpeg: async (quality = 0.82) => {
        if (!qrRef.current) return false;
        try {
          if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
            throw new Error('Clipboard image copying is not supported by this browser.');
          }
          if (typeof ClipboardItem.supports === 'function' && !ClipboardItem.supports('image/jpeg')) {
            throw new Error('This browser cannot copy JPEG images. Download JPEG instead.');
          }

          const source = await qrRef.current.getRawData('png');
          if (!(source instanceof Blob)) throw new Error('Could not prepare the QR image.');
          const bitmap = await createImageBitmap(source);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Could not prepare the QR image.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0);
          bitmap.close();

          const jpeg = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error('JPEG conversion failed.'))),
              'image/jpeg',
              Math.min(0.92, Math.max(0.65, quality)),
            );
          });
          await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': jpeg })]);
          return true;
        } catch (error) {
          onError?.(error instanceof Error ? error.message : 'Could not copy the QR image.');
          return false;
        }
      },
    }),
    [filename, onError],
  );

  return (
    <div
      ref={containerRef}
      className={`[&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:block ${className || ''}`}
      style={{ width: display, height: display, ...style }}
    />
  );
});

export default StyledQr;
