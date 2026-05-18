import { useAuth0 } from '@auth0/auth0-react'

export default function LoginPage() {
  const { loginWithRedirect } = useAuth0()

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundImage: 'url(/login-bg.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      {/* Overlay oscuro */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 30, 0, 0.55)',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 20,
        padding: '48px 40px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        maxWidth: 360,
        margin: '16px',
      }}>
        {/* Logo */}
        <img src="/pliot-iso.png" alt="Pliot" style={{ height: 64, width: 64, objectFit: 'contain', marginBottom: 4 }} />
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)', letterSpacing: '-0.5px', fontFamily: 'Inter, sans-serif' }}>
          Pliot
        </span>
        <span style={{ fontSize: 12, color: 'var(--p-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>
          Smart Agriculture
        </span>

        <button
          onClick={() => loginWithRedirect()}
          style={{
            background: 'var(--p-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 32px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.01em',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--p-primary-dark)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--p-primary)')}
        >
          Iniciar sesión
        </button>

        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--p-text-muted)', textAlign: 'center' }}>
          Pliot Smart Agriculture © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
