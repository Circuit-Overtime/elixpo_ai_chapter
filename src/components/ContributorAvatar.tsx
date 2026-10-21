"use client";

import { useState } from "react";

interface ContributorAvatarProps {
  login: string;
  src?: string;
  size: number;
  className?: string;
}

/**
 * GitHub avatar with a graceful fallback: if the image 404s (deleted user,
 * rate-limited, etc.) we render a gradient disc instead of a collapsed,
 * thin-line broken image.
 *
 * Uses a plain <img> with inline width/height/object-fit so the box is always
 * a fixed square - next/image's internal sizing can otherwise collapse the
 * element while loading or on error.
 */
export function ContributorAvatar({ login, src, size, className = "" }: ContributorAvatarProps) {
  const [errored, setErrored] = useState(false);
  const box = { width: size, height: size, minWidth: size, minHeight: size };

  if (errored || !login) {
    return (
      <div
        style={box}
        className={`rounded-full bg-gradient-to-br from-[#DEDBC8]/50 via-[#9a8cae]/40 to-[#44386e]/50 flex items-center justify-center shrink-0 ${className}`}
      >
        <span className="font-bold text-white/70 uppercase" style={{ fontSize: size * 0.4 }}>
          {login?.[0] ?? "?"}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || `https://github.com/${login}.png`}
      alt={login}
      loading="lazy"
      width={size}
      height={size}
      style={{ ...box, objectFit: "cover" }}
      onError={() => setErrored(true)}
      className={`rounded-full shrink-0 ${className}`}
    />
  );
}
