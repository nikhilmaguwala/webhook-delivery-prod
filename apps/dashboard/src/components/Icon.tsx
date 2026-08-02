type IconProps = {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function Icon({ name, filled, size = 24, className, style }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={{
        fontSize: size,
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : undefined,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

export function BrandLogo() {
  return (
    <span className="app-brand-icon">
      <Icon name="bolt" filled size={20} />
    </span>
  );
}
