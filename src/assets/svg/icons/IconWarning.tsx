import { Color } from '@shared/utils/types';

export function IconWarning({
  color,
  className,
}: {
  color?: Color;
  className?: string;
}) {
  return (
    <svg
      width="2rem"
      height="2rem"
      viewBox="0 0 23 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M12.5 15v2h-2v-2h2z" fill={color ?? '#FF897D'} />
      <path
        d="M22.5 11c0 6.075-4.925 11-11 11S.5 17.075.5 11s4.925-11 11-11 11 4.925 11 11zm-2 0a9 9 0 10-18 0 9 9 0 0018 0z"
        fill={color ?? '#FF897D'}
      />
      <path d="M12.5 5v9h-2V5h2z" fill="#FF897D" />
    </svg>
  );
}
