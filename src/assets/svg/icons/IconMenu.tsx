import { Color } from '@shared/utils/types';

export function IconMenu({
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
        d="M14.334 0.75H5.665C2.644 0.75 0.75 2.889 0.75 5.916V14.084C0.75 17.111 2.634 19.25 5.665 19.25H14.333C17.364 19.25 19.25 17.111 19.25 14.084V5.916C19.25 2.889 17.364 0.75 14.334 0.75Z"
        stroke={color ?? 'white'}
        strokeWidth={stroke ?? '1.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.9408 10.0129H13.9498"
        stroke={color ?? 'white'}
        strokeWidth={stroke ? stroke * 1.34 : '2'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.92909 10.0129H9.93809"
        stroke={color ?? 'white'}
        strokeWidth={stroke ? stroke * 1.34 : '2'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.92128 10.0129H5.93028"
        stroke={color ?? 'white'}
        strokeWidth={stroke ? stroke * 1.34 : '2'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
