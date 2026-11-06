interface LogoMarkProps {
  size?: number;
  goldColor?: string;
  className?: string;
}

export function LogoMark({ size = 32, goldColor = '#E8C96A', className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Fidelia Ledger logo mark"
      className={className}
    >
      <path d="M10 42 L10 22 Q10 7 24 7 Q38 7 38 22 L38 42" stroke={goldColor} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <line x1="10" y1="42" x2="38" y2="42" stroke={goldColor} strokeWidth="2"   strokeLinecap="round" />
      <line x1="10" y1="38" x2="38" y2="38" stroke={goldColor} strokeWidth="1"   strokeLinecap="round" opacity="0.45" />
      <line x1="24" y1="10" x2="24" y2="38" stroke={goldColor} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="16" y1="19" x2="32" y2="19" stroke={goldColor} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
