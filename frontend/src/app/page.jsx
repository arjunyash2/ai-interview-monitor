import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: '#E8E6E1' }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: '2rem' }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: '#00E5A0', marginBottom: 20 }}>
          AI INTERVIEW INTELLIGENCE
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 300, marginBottom: 12,
          fontFamily: 'serif', color: '#F5F3EE' }}>
          Behavioral Monitoring System
        </h1>
        <p style={{ fontSize: 12, color: '#5A5850', lineHeight: 1.8, marginBottom: 36 }}>
          478-point FaceMesh · Iris gaze tracking · Malpractice detection
        </p>
        <Link href="/monitor" style={{
          background: '#00E5A0', color: '#0A0A0F', padding: '12px 36px',
          textDecoration: 'none', fontSize: 11, fontWeight: 700,
          letterSpacing: 2, textTransform: 'uppercase', borderRadius: 2,
        }}>
          LAUNCH MONITOR
        </Link>
      </div>
    </div>
  );
}