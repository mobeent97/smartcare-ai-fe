import { BoothErrorBoundary } from '@/components/booth/BoothErrorBoundary';

export default function BoothLayout({ children }: { children: React.ReactNode }) {
  return <BoothErrorBoundary>{children}</BoothErrorBoundary>;
}
