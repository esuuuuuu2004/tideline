import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { photoCoverageForEstimate } from '@/lib/field-flood-model';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const STAGES = [
  require('../../../assets/images/field-stages/00-dry.webp'),
  require('../../../assets/images/field-stages/25-coverage.webp'),
  require('../../../assets/images/field-stages/50-coverage.webp'),
  require('../../../assets/images/field-stages/80-coverage.webp'),
  require('../../../assets/images/field-stages/100-coverage.webp'),
];

const COVERAGE_STAGES = [0, 25, 50, 80, 100];

function opacityForStage(coverage: number, stageIndex: number) {
  'worklet';
  if (coverage <= COVERAGE_STAGES[0]) return stageIndex === 0 ? 1 : 0;
  if (coverage >= COVERAGE_STAGES[4]) return stageIndex === 4 ? 1 : 0;

  let lowerIndex = 0;
  for (let index = 0; index < COVERAGE_STAGES.length - 1; index += 1) {
    if (coverage < COVERAGE_STAGES[index + 1]) {
      lowerIndex = index;
      break;
    }
  }

  const lower = COVERAGE_STAGES[lowerIndex];
  const upper = COVERAGE_STAGES[lowerIndex + 1];
  const blend = (coverage - lower) / (upper - lower);
  if (stageIndex === lowerIndex) return 1 - blend;
  if (stageIndex === lowerIndex + 1) return blend;
  return 0;
}

function StagePhoto({
  source,
  stageIndex,
  coverage,
}: {
  source: number;
  stageIndex: number;
  coverage: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacityForStage(coverage.get(), stageIndex),
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.layer, animatedStyle]}>
      <Image
        source={source}
        style={styles.image}
        contentFit="contain"
        cachePolicy="memory-disk"
        allowDownscaling
        transition={0}
      />
    </Animated.View>
  );
}

export function FieldStageBackground({
  coveragePercent,
  ready,
}: {
  coveragePercent: number | null;
  ready: boolean;
}) {
  const coverage = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const initialized = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const target = photoCoverageForEstimate(coveragePercent);
    // Keep the visual field dry until the estimate reaches the first flooded photo.
    // This only changes the photo mapping, never the coverage estimate itself.
    if (target === 0) {
      coverage.set(0);
      initialized.current = true;
      return;
    }
    if (!initialized.current) {
      coverage.set(target);
      initialized.current = true;
      return;
    }
    if (reducedMotion) {
      coverage.set(target);
      return;
    }
    coverage.set(withTiming(target, {
      duration: 720,
      easing: Easing.inOut(Easing.quad),
    }));
  }, [coverage, coveragePercent, ready, reducedMotion]);

  return (
    <View pointerEvents="none" style={styles.container}>
      {STAGES.map((source, stageIndex) => (
        <StagePhoto
          key={COVERAGE_STAGES[stageIndex]}
          source={source}
          stageIndex={stageIndex}
          coverage={coverage}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: '#07111B',
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
