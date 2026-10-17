"use client";

import { Check } from "lucide-react";

export interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  isPopular?: boolean;
  buttonText: string;
  accent?: string;
  onSelect: () => void;
}

export default function PricingCard({
  title,
  price,
  description,
  features,
  isPopular,
  buttonText,
  accent = "emerald",
  onSelect,
}: PricingCardProps) {
  const isAmber = accent === "amber";
  const isViolet = accent === "violet";

  let titleColor = "text-emerald-400";
  let checkColor = "text-emerald-500";

  if (isAmber) {
    titleColor = "text-amber-400";
    checkColor = "text-amber-500";
  } else if (isViolet) {
    titleColor = "text-violet-400";
    checkColor = "text-violet-500";
  }

  return (
    <div className={`relative flex flex-col p-10 bg-[rgba(10,10,10,0.95)] hover:bg-[rgba(10,10,10,1)] transition-colors border-x border-[rgba(240,237,230,0.05)]`}>
      {isPopular && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
      )}
      
      <div className="mb-6">
        <h3 className={`font-mono text-lg font-bold tracking-widest uppercase ${titleColor} mb-3`}>{title}</h3>
        <p className="text-[rgba(240,237,230,0.4)] text-sm h-10 leading-relaxed">{description}</p>
      </div>

      <div className="mb-8 flex items-baseline gap-1">
        <span className="text-5xl font-extrabold tracking-tight text-[#f0ede6]">{price}</span>
        {price !== "Custom" && <span className="text-[rgba(240,237,230,0.3)] font-medium">/mo</span>}
      </div>

      <button
        onClick={onSelect}
        className={`w-full py-4 px-4 font-mono text-xs font-bold tracking-[0.05em] uppercase transition-colors overflow-visible mb-10 ${
          isPopular 
            ? "bg-[#f0ede6] text-[#0a0a0a] hover:bg-white" 
            : "bg-[rgba(240,237,230,0.05)] text-[#f0ede6] hover:bg-[rgba(240,237,230,0.1)] border border-[rgba(240,237,230,0.1)]"
        }`}
        style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
      >
        {buttonText}
      </button>

      <div className="flex-grow">
        <ul className="space-y-4">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-[rgba(240,237,230,0.7)]">
              <svg className={`w-5 h-5 shrink-0 ${checkColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
