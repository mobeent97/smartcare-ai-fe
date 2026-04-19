import type { Metadata } from 'next';

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
    </div>
  );
}
