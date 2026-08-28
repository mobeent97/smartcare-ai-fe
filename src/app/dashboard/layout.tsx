import type { Metadata } from 'next';
import { MobileTabBar } from '@/components/dashboard/MobileTabBar';

export const metadata: Metadata = {
  title: 'Clinician Dashboard | Smart Care AI',
  description: 'Real-time patient queue management and triage case review.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-dash-bg">
      {children}
      {/* Fixed bottom navigation on phones. The padding below reserves its
          height so the last row of a list is never trapped underneath it. */}
      <MobileTabBar />
    </div>
  );
}
