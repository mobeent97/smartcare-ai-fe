interface BoothLayoutProps {
  avatarPanel: React.ReactNode;
  children: React.ReactNode;
}

export function BoothLayout({ avatarPanel, children }: BoothLayoutProps) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0a0f1e' }}>
      <div className="w-[45%] flex-shrink-0 relative">
        {avatarPanel}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
