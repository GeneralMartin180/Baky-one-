import { useState, MouseEvent } from 'react';

interface BakyAiPillProps {
  isActive?: boolean;
  onToggle?: (active: boolean) => void;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export default function BakyAiPill({
  isActive = false,
  onToggle,
  onClick,
  className = '',
  size = 'md',
}: BakyAiPillProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [internalActive, setInternalActive] = useState(isActive);

  const active = onToggle ? isActive : internalActive;

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextState = !active;
    setInternalActive(nextState);
    if (onToggle) onToggle(nextState);
    if (onClick) onClick();
  };

  const isEnergized = isHovered || active;

  return (
    <button
      type="button"
      id="ask-ai-pill-container"
      className={`relative inline-flex items-center justify-center select-none group cursor-pointer transition-transform duration-150 active:scale-95 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      title="Zapnúť alebo vypnúť prehľad zdrojov"
      aria-label="Prehľad zdrojov"
      aria-pressed={active}
    >
      {/* 1. Čisté čierne svetlo okolo pilulky (Clean black glow aura) */}
      <div
        className={`absolute -inset-1 rounded-full blur-[4px] transition-opacity duration-250 pointer-events-none ${
          isEnergized ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(15,23,42,0.5) 60%, transparent 100%)',
          boxShadow: isEnergized ? '0 0 12px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.4)' : 'none',
        }}
      />

      {/* 2. Čistá vodivá laserová dráha obiehajúca po obvode pilulky (Clean sharp perimeter beam) */}
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className={`absolute inset-0 w-full h-full pointer-events-none rounded-full transition-opacity duration-200 ${
          isEnergized ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ overflow: 'visible' }}
      >
        <rect
          x="1"
          y="1"
          width="98"
          height="30"
          rx="15"
          fill="none"
          stroke="url(#clean-black-beam)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="animate-clean-orbit"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="clean-black-beam" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000000" stopOpacity="1" />
            <stop offset="35%" stopColor="#475569" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#0f172a" stopOpacity="1" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>

      {/* 3. Telo pilulky - čistý nápis "Ask" bez hviezdičky */}
      <div
        className={`relative z-10 flex items-center justify-center rounded-full font-medium transition-all duration-200 ${
          size === 'sm'
            ? 'px-3 py-1 text-[12px] h-[28px]'
            : 'px-3.5 py-1.5 text-[12.5px] h-[32px]'
        } ${
          active
            ? 'bg-black text-white border border-black shadow-[0_0_8px_rgba(0,0,0,0.9)] font-semibold'
            : isHovered
            ? 'bg-white text-black border border-black shadow-[0_0_6px_rgba(0,0,0,0.5)] font-semibold'
            : 'bg-[#f1f3f4] hover:bg-[#e8eaed] text-[#3c4043] border border-[#dadce0]'
        }`}
      >
        <span className="tracking-tight whitespace-nowrap">
          Ask
        </span>
      </div>
    </button>
  );
}
