import { ImageResponse } from 'next/og';

// Generated at build time so the home-screen pin gets a real icon instead of a
// screenshot of the page. No binary asset to keep in the repo.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // iOS masks the corners itself, so this fills the full square.
          background: 'linear-gradient(145deg, #071c1c 0%, #04322f 100%)',
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none"
             stroke="#09f6ee" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.8 3v5.4a4.2 4.2 0 0 0 8.4 0V3" />
          <circle cx="18.4" cy="13.6" r="2.4" />
          <path d="M9 12.6v2.2a5.4 5.4 0 0 0 7 5.2" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
