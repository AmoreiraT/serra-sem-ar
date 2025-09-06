import { SVGProps } from 'react';

export function IconPencil(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g clipPath="url(#prefix__clip0_2468_2199)">
        <path
          d="M9.858 3.837l3.938 4.042-9.858 10.12H0v-4.042l9.858-10.12zm1.125-1.155L13.256.348a1.124 1.124 0 011.612 0l2.367 2.43a1.125 1.125 0 010 1.57l-2.314 2.377-3.938-4.043zM9.461 15.75h7.41a1.125 1.125 0 110 2.25H8.335a.66.66 0 01-.466-1.125l.796-.795a1.124 1.124 0 01.796-.33z"
          fill="#fff"
        />
      </g>
      <defs>
        <clipPath id="prefix__clip0_2468_2199">
          <path fill="#fff" d="M0 0h18v18H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}
