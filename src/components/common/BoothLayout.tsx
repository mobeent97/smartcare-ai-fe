interface BoothLayoutProps {
  avatarPanel: React.ReactNode;
  children: React.ReactNode;
}

export function BoothLayout({ avatarPanel, children }: BoothLayoutProps) {
  return (
    // Kiosk: nurse panel beside the content. Phone: stacked, with the panel
    // shrunk to a banner so the actual question is above the fold rather than
    // pushed off-screen by a 45%-wide column.
    <div
      className="booth-kiosk min-h-screen flex flex-col md:flex-row safe-x"
      style={{ backgroundColor: '#0a0f1e' }}
    >
      <div className="w-full md:w-[45%] md:flex-shrink-0 relative">
        {avatarPanel}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-5 md:p-8 overflow-y-auto safe-bottom">
        {children}
      </div>
    </div>
  );
}
