import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Smart Care AI',
  description: 'AI-powered medical triage booth',
  // Pinned to an iOS home screen this launches without Safari chrome. The
  // status bar sits ON TOP of the page, which is why every fixed edge below
  // uses the safe-area insets.
  // Static files in public/ rather than build-time ImageResponse routes: one
  // less thing to execute during a build, and no satori dependency.
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'SmartCare',
    // 'black' — NOT 'black-translucent'.
    //
    // black-translucent makes the web view full-screen with the status bar
    // floating over it, which then depends entirely on env(safe-area-inset-top)
    // being reported correctly. In standalone iOS that inset is frequently 0 in
    // this mode, so the padding collapses and the header slides under the clock
    // and the notch. 'black' makes iOS lay the web view out BELOW the status
    // bar, so an overlap is structurally impossible rather than merely
    // compensated for. The safe-area padding stays in place — it contributes 0
    // here and still does the right thing for the home indicator and for
    // landscape left/right insets.
    statusBarStyle: 'black',
  },
  formatDetection: {
    telephone: false,   // stop iOS turning vitals and ages into phone links
  },
  other: {
    // Next emits the modern `mobile-web-app-capable`, which iOS ignores.
    // Safari still keys standalone launch off the apple- prefixed tag, and
    // without it a home-screen pin opens inside Safari with browser chrome.
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Let the page paint under the Dynamic Island and home indicator; the CSS
  // then pads content back out with env(safe-area-inset-*). Without this the
  // insets are always 0 and the standalone app has black bars.
  viewportFit: 'cover',
  // A kiosk form: pinch-zoom on a patient-facing booth causes accidental
  // zoom that patients cannot undo. Text remains legible by design, not by
  // zooming. maximumScale is deliberately not set to 1 elsewhere so that
  // browser accessibility zoom still works on the dashboard.
  themeColor: '#071c1c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
