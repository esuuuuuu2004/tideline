/**
 * Minimal vector moon phase indicator computed from lunar age (0..29.53 days).
 */

import Svg, { Circle, Mask, Rect } from 'react-native-svg';

import { useTideTheme } from '@/theme/use-tide-theme';

interface MoonGlyphProps {
  ageDays: number;
  size?: number;
}

export function MoonGlyph({ ageDays, size = 22 }: MoonGlyphProps) {
  const { colors } = useTideTheme();
  const synodic = 29.53058867;
  const phase = ((ageDays % synodic) + synodic) % synodic / synodic; // 0..1

  // Approximate illuminated crescent/gibbous offset using a secondary mask circle
  const waxing = phase <= 0.5;
  const distFromHalf = Math.abs(phase - 0.5) * 2; // 1 at new/full, 0 at quarter
  const offset = (waxing ? -1 : 1) * (1 - Math.abs(phase * 2 - 1)) * 18;
  const isNearFull = phase > 0.45 && phase < 0.55;
  const isNearNew = phase < 0.05 || phase > 0.95;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={9}
        fill={colors.surfaceRaised}
        stroke={colors.border}
        strokeWidth={1.2}
      />
      {!isNearNew && (
        <>
          <Mask id="moonMask">
            <Rect x={0} y={0} width={24} height={24} fill="black" />
            <Circle cx={12} cy={12} r={8.5} fill="white" />
            {!isNearFull && (
              <Circle
                cx={12 + (offset === 0 ? (waxing ? -7 : 7) : offset)}
                cy={12}
                r={8.5 + (1 - distFromHalf) * 1.5}
                fill="black"
              />
            )}
          </Mask>
          <Circle
            cx={12}
            cy={12}
            r={8.5}
            fill={colors.accentMuted}
            mask="url(#moonMask)"
          />
        </>
      )}
    </Svg>
  );
}
