// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §9 Design — Progress Stepper
// 4-dot progress indicator used on Path L screens 2–5 only.
// NativeWind v4 does not support ring-* utilities — active dot uses border on a wrapper View.
// Each dot is its own component to keep hooks at the top level (Rules of Hooks).
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface ProgressStepperProps {
  currentStep: number;
  totalSteps: number;
}

interface StepDotProps {
  step: number;
  currentStep: number;
}

function StepDot({ step, currentStep }: StepDotProps) {
  const scale = useSharedValue(1);
  const isComplete = step < currentStep;
  const isActive = step === currentStep;

  useEffect(() => {
    if (step === currentStep - 1) {
      scale.value = withSequence(
        withTiming(1.3, { duration: 100 }),
        withTiming(1.0, { duration: 100 }),
      );
    }
  }, [currentStep, scale, step]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (isActive) {
    return (
      <View className="w-[18px] h-[18px] rounded-full border border-amber-500/40 items-center justify-center mx-1.5">
        <View className="w-2.5 h-2.5 rounded-full bg-amber-500" />
      </View>
    );
  }

  return (
    <Animated.View
      style={animStyle}
      className={
        isComplete
          ? 'w-2.5 h-2.5 rounded-full bg-amber-500 mx-1.5'
          : 'w-2.5 h-2.5 rounded-full bg-zinc-700 mx-1.5'
      }
    />
  );
}

export function ProgressStepper({ currentStep, totalSteps }: ProgressStepperProps) {
  return (
    <View className="flex-row items-center justify-center mt-4 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => (
        <StepDot key={i + 1} step={i + 1} currentStep={currentStep} />
      ))}
    </View>
  );
}
