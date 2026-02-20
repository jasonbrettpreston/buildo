'use client';

interface BadgeProps {
  label: string;
  color?: string;
  variant?: 'solid' | 'outline';
  size?: 'sm' | 'md';
}

const VARIANT_CLASSES = {
  solid: 'text-white',
  outline: 'bg-transparent border',
};

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

export function Badge({
  label,
  color = '#6B7280',
  variant = 'solid',
  size = 'sm',
}: BadgeProps) {
  const style =
    variant === 'solid'
      ? { backgroundColor: color }
      : { borderColor: color, color };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`}
      style={style}
    >
      {label}
    </span>
  );
}
