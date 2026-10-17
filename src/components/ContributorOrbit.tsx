import { ContributorAvatar } from "./ContributorAvatar";

export interface OrbitContributor {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
}

const rankStyles = [
  "from-yellow-300 to-amber-500 text-black",
  "from-slate-200 to-slate-400 text-black",
  "from-orange-300 to-orange-600 text-black",
];

export function ContributorOrbitAvatar({
  contributor,
  rank,
  size,
}: {
  contributor: OrbitContributor;
  rank: number;
  size: number;
}) {
  return (
    <a
      href={contributor.html_url || `https://github.com/${contributor.login}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${contributor.login}${contributor.contributions ? ` · ${contributor.contributions} contributions` : ""}`}
      className="relative block group/av"
    >
      <ContributorAvatar
        login={contributor.login}
        src={contributor.avatar_url}
        size={size}
        className={`border-2 ${rank < 3 ? "border-primary" : "border-[#DEDBC8]/30"} shadow-md group-hover/av:border-primary transition-colors`}
      />
      {rank < 3 && (
        <span className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-br ${rankStyles[rank]} text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-black`}>
          {rank + 1}
        </span>
      )}
    </a>
  );
}

export function ContributorOrbitRing({
  items,
  inset,
  spin,
  counter,
  size,
  startRank,
}: {
  items: OrbitContributor[];
  inset: string;
  spin: string;
  counter: string;
  size: number;
  startRank: number;
}) {
  return (
    <div className={`absolute ${inset} rounded-full border border-white/10`}>
      <div className={`relative w-full h-full ${spin}`}>
        {items.map((contributor, index) => {
          const angle = (index / items.length) * 360;
          const radians = (angle * Math.PI) / 180;
          const x = 50 + 50 * Math.cos(radians);
          const y = 50 + 50 * Math.sin(radians);
          return (
            <div
              key={contributor.login}
              className={`absolute ${counter}`}
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              <ContributorOrbitAvatar contributor={contributor} rank={startRank + index} size={size} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
