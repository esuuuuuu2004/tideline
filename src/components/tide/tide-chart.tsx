/**
 * Interactive 24-hour harmonic tide curve for Taluksangay, Zamboanga City.
 *
 * Uses react-native-svg for the vector spline & datum lines, and RNGH v3 +
 * Reanimated shared values on the UI thread for zero-jank scrubbing with
 * quantized 15-minute readouts and haptic detents at High/Low extrema.
 */

import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { TideText } from '@/components/ui/tide-text';
import { Spacing } from '@/constants/theme';
import {
  STATION,
  formatHeight,
  formatPhtTime,
  type DayForecast,
  type TideUnit,
  type TimeFormat,
} from '@/lib/tides';
import { useTideTheme } from '@/theme/use-tide-theme';

interface TideChartProps {
  forecast: DayForecast;
  unit: TideUnit;
  timeFormat: TimeFormat;
  /** Current PHT minute of day (0..1440) when viewing Today; null otherwise. */
  nowMinute: number | null;
  /** Controlled scrubbed sample index (0..96) or null when live/unscrubbed. */
  scrubIndex: number | null;
  onScrubIndexChange: (index: number | null) => void;
  /** Compact height variant for Forecast tab */
  height?: number;
}

const CHART_PAD_X = 10;
const CHART_PAD_TOP = 26;
const CHART_PAD_BOTTOM = 28;

function buildSmoothPaths(points: readonly { x: number; y: number }[], baselineY: number) {
  if (points.length === 0) return { linePath: '', areaPath: '' };
  if (points.length === 1) {
    const p = points[0];
    return {
      linePath: `M ${p.x} ${p.y}`,
      areaPath: `M ${p.x} ${baselineY} L ${p.x} ${p.y} L ${p.x} ${baselineY} Z`,
    };
  }

  // Catmull-Rom to cubic Bezier conversion for smooth harmonic curves
  let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    line += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
  return { linePath: line, areaPath: area };
}

export function TideChart({
  forecast,
  unit,
  timeFormat,
  nowMinute,
  scrubIndex,
  onScrubIndexChange,
  height = 210,
}: TideChartProps) {
  const { colors, fontsLoaded } = useTideTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);

  const plotWidth = Math.max(1, width - CHART_PAD_X * 2);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);
  const baselineY = CHART_PAD_TOP + plotHeight;

  // Fixed y-domain around Zamboanga's realistic range so curves are comparable across days
  const yMin = Math.min(-0.15, forecast.minMeters - 0.12);
  const yMax = Math.max(1.65, forecast.maxMeters + 0.16);
  const ySpan = Math.max(0.5, yMax - yMin);

  const toY = useCallback(
    (meters: number) =>
      CHART_PAD_TOP + (1 - (meters - yMin) / ySpan) * plotHeight,
    [yMin, ySpan, plotHeight],
  );

  const points = useMemo(
    () =>
      forecast.samples.map((s) => ({
        x: CHART_PAD_X + (s.minuteOfDay / 1440) * plotWidth,
        y: toY(s.heightMeters),
      })),
    [forecast.samples, plotWidth, toY],
  );

  const yCoords = useMemo(() => points.map((p) => p.y), [points]);

  const { linePath, areaPath } = useMemo(
    () => buildSmoothPaths(points, baselineY),
    [points, baselineY],
  );

  const mslY = toY(STATION.meanSeaLevelMeters);
  const datumY = toY(0);

  const extremaMarkers = useMemo(
    () =>
      forecast.extrema.map((ex) => ({
        ...ex,
        x: CHART_PAD_X + (ex.minuteOfDay / 1440) * plotWidth,
        y: toY(ex.heightMeters),
        step: Math.round(ex.minuteOfDay / 15),
      })),
    [forecast.extrema, plotWidth, toY],
  );

  const extremaSteps = useMemo(
    () => extremaMarkers.map((m) => m.step),
    [extremaMarkers],
  );

  const nowCoords = useMemo(() => {
    if (nowMinute === null || width === 0) return null;
    const clamped = Math.max(0, Math.min(1440, nowMinute));
    const idxFloat = (clamped / 1440) * (points.length - 1);
    const i0 = Math.floor(idxFloat);
    const i1 = Math.min(points.length - 1, i0 + 1);
    const frac = idxFloat - i0;
    const y = points[i0].y + (points[i1].y - points[i0].y) * frac;
    return {
      x: CHART_PAD_X + (clamped / 1440) * plotWidth,
      y,
    };
  }, [nowMinute, width, points, plotWidth]);

  // Shared values for UI-thread scrubbing
  const isScrubbing = useSharedValue(0);
  const scrubX = useSharedValue(CHART_PAD_X);
  const scrubY = useSharedValue(CHART_PAD_TOP + plotHeight * 0.5);
  const lastStep = useSharedValue(-1);
  const lastExtremumStep = useSharedValue(-1);

  const fireTick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const commitStep = useCallback(
    (step: number) => {
      onScrubIndexChange(step);
    },
    [onScrubIndexChange],
  );

  // Sync shared scrub indicator if parent resets scrubIndex to null or changes day
  useEffect(() => {
    if (width === 0 || yCoords.length === 0) return;
    if (scrubIndex === null) {
      isScrubbing.set(0);
      lastStep.set(-1);
      lastExtremumStep.set(-1);
      if (nowCoords) {
        scrubX.set(nowCoords.x);
        scrubY.set(nowCoords.y);
      }
      return;
    }
    const clampedIdx = Math.max(0, Math.min(yCoords.length - 1, scrubIndex));
    const targetX = CHART_PAD_X + (clampedIdx / (yCoords.length - 1)) * plotWidth;
    const targetY = yCoords[clampedIdx];
    isScrubbing.set(1);
    if (reduced) {
      scrubX.set(targetX);
      scrubY.set(targetY);
    } else {
      scrubX.set(withSpring(targetX, { duration: 220, dampingRatio: 1 }));
      scrubY.set(withSpring(targetY, { duration: 220, dampingRatio: 1 }));
    }
  }, [scrubIndex, width, yCoords, plotWidth, nowCoords, reduced, isScrubbing, scrubX, scrubY, lastStep, lastExtremumStep]);

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-10, 10],
    onActivate: (e) => {
      'worklet';
      if (plotWidth <= 1 || yCoords.length === 0) return;
      isScrubbing.set(1);
      const clampedX = Math.max(CHART_PAD_X, Math.min(CHART_PAD_X + plotWidth, e.x));
      const ratio = (clampedX - CHART_PAD_X) / plotWidth;
      const idxFloat = ratio * (yCoords.length - 1);
      const i0 = Math.floor(idxFloat);
      const i1 = Math.min(yCoords.length - 1, i0 + 1);
      const frac = idxFloat - i0;
      scrubX.set(clampedX);
      scrubY.set(yCoords[i0] + (yCoords[i1] - yCoords[i0]) * frac);
      const step = Math.round(ratio * (yCoords.length - 1));
      lastStep.set(step);
      scheduleOnRN(commitStep, step);
    },
    onUpdate: (e) => {
      'worklet';
      if (plotWidth <= 1 || yCoords.length === 0) return;
      const clampedX = Math.max(CHART_PAD_X, Math.min(CHART_PAD_X + plotWidth, e.x));
      const ratio = (clampedX - CHART_PAD_X) / plotWidth;
      const idxFloat = ratio * (yCoords.length - 1);
      const i0 = Math.floor(idxFloat);
      const i1 = Math.min(yCoords.length - 1, i0 + 1);
      const frac = idxFloat - i0;
      scrubX.set(clampedX);
      scrubY.set(yCoords[i0] + (yCoords[i1] - yCoords[i0]) * frac);

      const step = Math.round(ratio * (yCoords.length - 1));
      if (step !== lastStep.get()) {
        lastStep.set(step);
        scheduleOnRN(commitStep, step);

        // Fire subtle haptic detent when crossing a High or Low tide peak
        let matchedExt = -1;
        for (let k = 0; k < extremaSteps.length; k++) {
          if (Math.abs(step - extremaSteps[k]) <= 1) {
            matchedExt = extremaSteps[k];
            break;
          }
        }
        if (matchedExt !== -1 && matchedExt !== lastExtremumStep.get()) {
          lastExtremumStep.set(matchedExt);
          scheduleOnRN(fireTick);
        } else if (matchedExt === -1 && lastExtremumStep.get() !== -1) {
          lastExtremumStep.set(-1);
        }
      }
    },
  });

  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled || plotWidth <= 1 || yCoords.length === 0) return;
      isScrubbing.set(1);
      const clampedX = Math.max(CHART_PAD_X, Math.min(CHART_PAD_X + plotWidth, e.x));
      const ratio = (clampedX - CHART_PAD_X) / plotWidth;
      const step = Math.round(ratio * (yCoords.length - 1));
      const targetX = CHART_PAD_X + (step / (yCoords.length - 1)) * plotWidth;
      const targetY = yCoords[step];
      scrubX.set(reduced ? targetX : withSpring(targetX, { duration: 200, dampingRatio: 1 }));
      scrubY.set(reduced ? targetY : withSpring(targetY, { duration: 200, dampingRatio: 1 }));
      lastStep.set(step);
      scheduleOnRN(commitStep, step);
      scheduleOnRN(fireTick);
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const lineOverlayStyle = useAnimatedStyle(() => ({
    opacity: isScrubbing.get(),
    transform: [{ translateX: scrubX.get() - 0.5 }],
  }));

  const dotOverlayStyle = useAnimatedStyle(() => ({
    opacity: isScrubbing.get(),
    transform: [
      { translateX: scrubX.get() - 6 },
      { translateY: scrubY.get() - 6 },
    ],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };

  const axisLabels = useMemo(() => {
    const hours = [0, 6, 12, 18, 24];
    return hours.map((h) => {
      const label =
        timeFormat === '24h'
          ? `${String(h === 24 ? 24 : h).padStart(2, '0')}:00`
          : h === 0 || h === 24
            ? '12a'
            : h === 12
              ? '12p'
              : h < 12
                ? `${h}a`
                : `${h - 12}p`;
      const x = CHART_PAD_X + (h / 24) * plotWidth;
      return { h, label, x };
    });
  }, [timeFormat, plotWidth]);

  const svgFontFamily = fontsLoaded ? 'Inter_500' : undefined;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {width > 0 ? (
        <GestureDetector gesture={gesture}>
          <View style={{ width, height }}>
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.28} />
                  <Stop offset="100%" stopColor={colors.accent} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>

              {/* Mean Sea Level hairline */}
              <Line
                x1={CHART_PAD_X}
                y1={mslY}
                x2={CHART_PAD_X + plotWidth}
                y2={mslY}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="4 4"
              />

              {/* MLLW 0.0 datum line */}
              {datumY <= baselineY && datumY >= CHART_PAD_TOP && (
                <Line
                  x1={CHART_PAD_X}
                  y1={datumY}
                  x2={CHART_PAD_X + plotWidth}
                  y2={datumY}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              )}

              {/* Water body fill + harmonic curve */}
              <Path d={areaPath} fill="url(#tideFill)" />
              <Path
                d={linePath}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
              />

              {/* High & Low extremum pins */}
              {extremaMarkers.map((m) => {
                const isHigh = m.kind === 'high';
                const labelY = isHigh
                  ? Math.max(12, m.y - 10)
                  : Math.min(baselineY + 11, m.y + 16);
                const clampedX = Math.max(CHART_PAD_X + 24, Math.min(width - CHART_PAD_X - 24, m.x));
                return (
                  <G key={m.timestampMs}>
                    <Circle
                      cx={m.x}
                      cy={m.y}
                      r={3.5}
                      fill={colors.background}
                      stroke={isHigh ? colors.accent : colors.warning}
                      strokeWidth={2}
                    />
                    <SvgText
                      x={clampedX}
                      y={labelY}
                      fill={isHigh ? colors.accentMuted : colors.textSecondary}
                      fontSize={10.5}
                      fontFamily={svgFontFamily}
                      fontWeight="600"
                      textAnchor="middle">
                      {formatHeight(m.heightMeters, unit)}
                    </SvgText>
                  </G>
                );
              })}

              {/* Current time beacon */}
              {nowCoords && (
                <>
                  <Line
                    x1={nowCoords.x}
                    y1={CHART_PAD_TOP}
                    x2={nowCoords.x}
                    y2={baselineY}
                    stroke={colors.accentMuted}
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />
                  <Circle
                    cx={nowCoords.x}
                    cy={nowCoords.y}
                    r={6}
                    fill={colors.accent}
                    fillOpacity={0.22}
                  />
                  <Circle
                    cx={nowCoords.x}
                    cy={nowCoords.y}
                    r={3.5}
                    fill={colors.text}
                    stroke={colors.accent}
                    strokeWidth={2}
                  />
                </>
              )}

              {/* Hour labels along bottom */}
              {axisLabels.map((tick) => (
                <SvgText
                  key={tick.h}
                  x={tick.x}
                  y={height - 6}
                  fill={colors.textSecondary}
                  fontSize={10.5}
                  fontFamily={svgFontFamily}
                  textAnchor={
                    tick.h === 0 ? 'start' : tick.h === 24 ? 'end' : 'middle'
                  }>
                  {tick.label}
                </SvgText>
              ))}
            </Svg>

            {/* UI-thread scrub plumb line & reticle */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.scrubLine,
                {
                  top: CHART_PAD_TOP,
                  height: plotHeight,
                  backgroundColor: colors.text,
                },
                lineOverlayStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.scrubDot,
                {
                  backgroundColor: colors.accent,
                  borderColor: colors.background,
                },
                dotOverlayStyle,
              ]}
            />
          </View>
        </GestureDetector>
      ) : (
        <View style={{ height }} />
      )}

      <View style={styles.legendRow}>
        <TideText token="caption" color="textSecondary">
          Drag or tap curve to inspect · {STATION.datum} datum
        </TideText>
        {scrubIndex !== null && (
          <TideText token="caption" role="data" color="accent">
            {formatPhtTime(forecast.samples[scrubIndex].timestampMs, timeFormat)}
          </TideText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  scrubLine: {
    position: 'absolute',
    left: 0,
    width: 1,
    opacity: 0.65,
  },
  scrubDot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
});
