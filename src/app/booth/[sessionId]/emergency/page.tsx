'use client';

export default function EmergencyPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center ctas-pulse"
      style={{ backgroundColor: '#dc2626' }}
    >
      <div className="text-center px-8">
        {/* Cross / Alert icon */}
        <div className="flex justify-center mb-8">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
            <rect x="38" y="10" width="24" height="80" rx="6" fill="white" />
            <rect x="10" y="38" width="80" height="24" rx="6" fill="white" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-1px',
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          HELP IS ON<br />THE WAY
        </h1>

        <p
          style={{
            fontSize: 20,
            color: 'rgba(255,255,255,0.9)',
            marginBottom: 32,
            fontWeight: 500,
          }}
        >
          Stay calm. Medical personnel have been alerted.
        </p>

        <div
          style={{
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: 16,
            padding: '16px 24px',
            display: 'inline-block',
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
            Do not leave. A nurse will come to you immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
