import S from '../S';

export default function Placeholder({ title }) {
  return (
    <div style={S.content}>
      <div style={S.card}>
        <div style={{ ...S.emptyState, padding: '60px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
          <div style={{ fontSize: 16, color: '#666677', marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#444455' }}>Coming soon</div>
        </div>
      </div>
    </div>
  );
}
