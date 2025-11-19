import React from "react";
import {
    Insets,
    Pressable,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from "react-native";

export type CardPressableProps = {
  children: React.ReactNode;
  radius?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  ripple: string;
  overlayColor?: string;
  hitSlop?: number | Insets;
  accessibilityLabel?: string;
  pressedScale?: number;
};

export const CardPressable = React.memo(function CardPressable({
  children,
  radius = 14,
  onPress,
  onLongPress,
  delayLongPress,
  style,
  disabled,
  ripple,
  overlayColor,
  hitSlop,
  accessibilityLabel,
  pressedScale = 1.0,
}: CardPressableProps) {
  const overlay = overlayColor ?? "rgba(255,255,255,0.10)";

  return (
    <View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress ?? 350}
        android_ripple={
          !disabled ? { color: ripple, borderless: false } : undefined
        }
        hitSlop={hitSlop}
        style={({ pressed }) => [
          { borderRadius: radius },
          pressed &&
            pressedScale !== 1 && { transform: [{ scale: pressedScale }] },
        ]}
      >
        {({ pressed }) => (
          <View style={{ borderRadius: radius }}>
            {children}
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: overlay,
                  opacity: pressed && !disabled ? 1 : 0,
                },
              ]}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
});
