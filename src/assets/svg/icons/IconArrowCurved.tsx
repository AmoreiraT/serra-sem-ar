import { Color } from '@shared/utils/types';

export function IconArrowCurved({
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
    left: 180,
    right: 0,
    up: 270,
    down: 90,
  };

  return (
    <svg
      width={`${size ?? 2.4}rem`}
      height={`${size ?? 2.4}rem`}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ transform: `rotate(${angleOfTransform[direction]}deg)` }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M32.0013 62.832C55.1246 62.832 62.8346 55.122 62.8346 31.9987C62.8346 8.87537 55.1246 1.16537 32.0013 1.16537C8.87797 1.16537 1.16797 8.87537 1.16797 31.9987C1.16797 55.122 8.87797 62.832 32.0013 62.832Z"
        stroke={color ?? 'white'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27.1953 43.5703C27.1953 43.5703 38.8153 35.597 38.8153 31.997C38.8153 28.397 27.1953 20.4303 27.1953 20.4303"
        stroke={color ?? 'white'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
