import { Color } from '@shared/utils/types';

export function IconBomb({
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
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g clipPath="url(#prefix__clip0_2260_22040)">
        <path
          d="M21.52 2.456L20.747.305A.555.555 0 0020.255 0a.548.548 0 00-.488.305l-.773 2.151-2.157.788a.52.52 0 00-.337.487c0 .211.14.408.337.478l2.143.788.787 2.147c.07.206.272.351.488.351a.525.525 0 00.487-.351l.774-2.147 2.142-.788a.517.517 0 00.337-.478.525.525 0 00-.337-.487l-2.138-.788zm-6.206 2.485a1.502 1.502 0 00-2.123 0l-.136.136A9.749 9.749 0 000 14.25 9.749 9.749 0 009.75 24a9.749 9.749 0 009.75-9.75 9.773 9.773 0 00-.572-3.305l.136-.136a1.502 1.502 0 000-2.123l-3.75-3.75v.005zM9.375 9A4.877 4.877 0 004.5 13.875v.375c0 .412-.338.75-.75.75a.752.752 0 01-.75-.75v-.375A6.376 6.376 0 019.375 7.5h.375c.412 0 .75.338.75.75s-.338.75-.75.75h-.375z"
          fill={color ?? '#DE3730'}
        />
      </g>
      <defs>
        <clipPath id="prefix__clip0_2260_22040">
          <path fill="#fff" d="M0 0h24v24H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}
