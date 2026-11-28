import { GlassView } from 'expo-glass-effect';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, type ViewProps } from 'react-native';
import { TideText as BaseTideText } from '@/components/ui/tide-text';

type GlassPanelProps = ViewProps & { tone?: 'neutral' | 'playable' | 'flooded' };

export function GlassPanel({ style, children, tone = 'neutral', ...rest }: GlassPanelProps) {
  const tintColor = tone === 'playable'
    ? 'rgba(17, 105, 67, 0.24)'
    : tone === 'flooded'
      ? 'rgba(143, 38, 42, 0.26)'
      : 'rgba(7, 20, 33, 0.16)';
  return (
    <GlassView
      {...rest}
      glassEffectStyle="clear"
      colorScheme="dark"
      tintColor={tintColor}
      style={[
        styles.panel,
        tone === 'playable' ? styles.playable : tone === 'flooded' ? styles.flooded : null,
        style,
      ]}>
      {children}
    </GlassView>
  );
}

type GlassTextProps = ComponentProps<typeof BaseTideText>;

const glassTextColors = {
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.78)',
  accent: '#87EAF2',
  accentMuted: '#B8F1F6',
  warning: '#FFD089',
} as const;

/** Keeps text readable on the dark translucent panels in either app theme. */
export function GlassText({ color = 'text', style, ...rest }: GlassTextProps) {
  return <BaseTideText {...rest} color={color} style={[{ color: glassTextColors[color], textShadowColor: 'rgba(0,0,0,0.34)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }, style]} />;
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(5, 15, 26, 0.28)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  playable: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(20, 105, 65, 0.34)',
    borderColor: 'rgba(175, 255, 208, 0.36)',
  },
  flooded: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(143, 38, 42, 0.36)',
    borderColor: 'rgba(255, 185, 178, 0.4)',
  },
});
