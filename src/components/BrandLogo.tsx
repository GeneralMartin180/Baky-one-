import bakyLogo from '../assets/baky-one-256.png';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  showText?: boolean;
}

export default function BrandLogo({
  className = '',
  size = 'md',
  onClick,
  showText = true,
}: BrandLogoProps) {
  const iconSize =
    size === 'sm'
      ? 'w-6 h-6'
      : size === 'lg'
      ? 'w-10 h-10 sm:w-20 sm:h-20'
      : 'w-8 h-8';

  const textSize =
    size === 'sm'
      ? 'text-base font-bold'
      : size === 'lg'
      ? 'text-4xl sm:text-5xl font-bold tracking-tight'
      : 'text-xl font-bold tracking-tight';

  const content = <>
      <img
        src={bakyLogo}
        alt="Baky One"
        className={`${iconSize} object-contain shrink-0`}
        draggable={false}
      />
      {showText && (
        <span className={`${textSize} text-[#202124] sm:lowercase font-sans`}>
          Baky One
        </span>
      )}
  </>;

  return onClick ? (
    <button type="button" onClick={onClick} className={`cursor-pointer inline-flex items-center gap-2.5 select-none ${className}`} title="Baky One - Domov" aria-label="Baky One">{content}</button>
  ) : (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`} aria-label="Baky One">{content}</div>
  );
}
