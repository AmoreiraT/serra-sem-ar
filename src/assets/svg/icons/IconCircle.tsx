import { Color } from '@shared/utils/types';

export function IconCircle({
  color,
  className,
}: {
  color?: Color;
  className?: string;
}) {
  return (
    <svg className={className ?? ''} height={24} width={24}>
      <circle cx="12" cy="12" r="10" fill={color ?? 'white'} />
    </svg>
  );
}
