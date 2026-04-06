import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      backgroundColor: '#ffffff',
      border: '1px solid #ddd6f8',
      borderRadius: 12,
      padding: '12px 18px',
      boxShadow: '0 4px 20px rgba(109,95,199,0.15)',
      fontSize: 14,
      color: '#2d2b38',
      zIndex: 9999,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 16 }}>✨</span>
      <span>New version available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: 'linear-gradient(135deg, #8b7cf6, #6d5fc7)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        Refresh
      </button>
    </div>
  );
}
