import { Color } from '@shared/utils/types';

export function IconArrowBroken({
  color,
  className,
  size,
  direction,
}: {
  color?: Color;
  className?: string;
  size?: number;
  direction: 'left' | 'right' | 'up' | 'down';
}) {
  const angleOfTransform: Record<'left' | 'right' | 'up' | 'down', number> = {
    left: 0,
    right: 180,
    up: 90,
    down: 270,
  };
  return (
    <svg
      width={`${size ?? 2.4}rem`}
      height={`${size ?? 2.4}rem`}
      viewBox="0 0 10 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ transform: `rotate(${angleOfTransform[direction]}deg)` }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.25589 0.242789C9.58048 0.56431 9.58271 1.08555 9.25366 1.40707L4.38822 6.17172L4.30227 6.24513C3.97341 6.48973 3.50333 6.46416 3.20477 6.16843C3.04303 6.00822 2.96049 5.79753 2.96049 5.58794C2.96049 5.37725 3.04303 5.16546 3.207 5.00525L8.07244 0.239497L8.15839 0.16609C8.48726 -0.0785104 8.95733 -0.0529439 9.25589 0.242789ZM9.32914 14.6783C9.58021 15.001 9.55354 15.4636 9.256 15.7583C8.9303 16.0798 8.40048 16.0809 8.07255 15.7594L0.746507 8.5828L0.671314 8.49872C0.55732 8.35233 0.5 8.1766 0.5 8.00011C0.5 7.79052 0.582541 7.57983 0.744276 7.41962C1.06998 7.097 1.5998 7.0959 1.92773 7.41742L9.25377 14.594L9.32914 14.6783Z"
        fill={color ?? 'white'}
      />
    </svg>
  );
}
