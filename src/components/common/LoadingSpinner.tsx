interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 24, md: 48, lg: 80 };

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const px = sizes[size];
  return (
    <svg
      className={`spinner ${className}`}
      width={px}
      height={px}
      viewBox="0 0 50 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="25" cy="25" r="20"
        stroke="#374151"
        strokeWidth="4"
      />
      <path
        d="M25 5 A20 20 0 0 1 45 25"
        stroke="#36c9c5"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
