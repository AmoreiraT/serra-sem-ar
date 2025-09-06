import { Color } from '@shared/utils/types';

export function IconMenuOpen({
  size,
  stroke,
  color,
  className,
}: {
  size?: number;
  stroke?: number;
  color?: Color;
  className?: string;
}) {
  return (
    <svg
      width={`${size ?? 2.4}rem`}
      height={`${size ?? 2.4}rem`}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.75 5.666L0.75 14.335C0.75 17.355 2.889 19.25 5.916 19.25L14.084 19.25C17.111 19.25 19.25 17.365 19.25 14.335L19.25 5.666C19.25 2.636 17.111 0.75 14.084 0.75L5.916 0.75C2.889 0.75 0.75 2.636 0.75 5.666Z"
        stroke={color ?? 'white'}
        strokeWidth={stroke ?? '1.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.91394 10L14.0859 10"
        stroke={color ?? 'white'}
        strokeWidth={stroke ?? '1.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.67578 13.748L5.91178 9.99995L9.67578 6.25195"
        stroke={color ?? 'white'}
        strokeWidth={stroke ?? '1.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
