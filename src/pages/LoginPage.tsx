import { useAuth0 } from '@auth0/auth0-react'

export default function LoginPage() {
  const { loginWithRedirect } = useAuth0()

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#f5f5f5',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '48px 40px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        minWidth: 320,
      }}>
        <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: 2, color: '#1a1a2e' }}>
          Pliot
        </h1>
        <button
          onClick={() => loginWithRedirect()}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 32px',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Iniciar sesión
        </button>
      </div>
    </div>
  )
}
