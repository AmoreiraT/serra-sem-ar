import { Color } from '@shared/utils/types';

export function IconCheckThin({
  color,
  className,
  size,
}: {
  color?: Color;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={`${size ?? 2.4}rem`}
      height={`${size ?? 2.4}rem`}
      viewBox="0 0 25 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M23.5165 3.64023L9.47212 20.4935L2.03125 12.84L3.46524 11.4458L9.3577 17.5066L21.98 2.35986L23.5165 3.64023Z"
        fill={color ?? 'white'}
      />
    </svg>
  );
}
