'use client';

import ColorBends from '@/components/ui/ColorBends';

interface BendsSectionProps {
  children: React.ReactNode;
  colors: string[];
  rotation?: number;
  speed?: number;
  warpStrength?: number;
  frequency?: number;
  intensity?: number;
  bandWidth?: number;
  iterations?: number;
  overlay?: string;
}

export default function BendsSection({
  children,
  colors,
  rotation = 90,
  speed = 0.12,
  warpStrength = 1,
  frequency = 1,
  intensity = 1.4,
  bandWidth = 6,
  iterations = 1,
  overlay = 'rgba(8, 8, 10, 0.78)',
}: BendsSectionProps) {
  return (
    <div style={{ position: 'relative', isolation: 'isolate' }}>
      <ColorBends
        colors={colors}
        rotation={rotation}
        speed={speed}
        warpStrength={warpStrength}
        frequency={frequency}
        intensity={intensity}
        bandWidth={bandWidth}
        iterations={iterations}
        mouseInfluence={0.3}
        parallax={0.2}
        noise={0.08}
        transparent={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: -2,
          pointerEvents: 'none',
        }}
      />
      {/* overlay semiopaco para que el texto sea legible */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: overlay,
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
}
