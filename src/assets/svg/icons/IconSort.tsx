import { Color } from '@shared/utils/types';

export function IconSort({
  color,
  className,
}: {
  color?: Color;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="2.4rem"
      viewBox="0 0 24 24"
      width="2.4rem"
      fill={color ?? 'white'}
      className={className}
    >
      <path d="M0 0h24v24H0V0z" fill="none" />
      <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
    </svg>
  );
}
