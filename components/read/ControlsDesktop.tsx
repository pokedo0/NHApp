import React from "react";
import { StyleSheet, View } from "react-native";
import { IconBtn, ToggleBtn } from "./Buttons";

export function ControlsDesktop({
  colors,
  canDual,
  settings,
  setOrientation,
  toggleDual,
  toggleFit,
  tapFlipEnabled,
  toggleTapFlip,
  handSwap,
  toggleHandSwap,
  inspect,
  toggleInspect,
  jumpPrev,
  jumpNext,
  onBack,
  isSingleFrame,
  continuous,
  toggleContinuous,
}: {
  colors: any;
  canDual: boolean;
  settings: {
    orientation: "vertical" | "horizontal";
    dualInLandscape: boolean;
    fit: "contain" | "cover";
  };
  setOrientation: (o: "vertical" | "horizontal") => void;
  toggleDual: () => void;
  toggleFit: () => void;
  tapFlipEnabled: boolean;
  toggleTapFlip: () => void;
  handSwap: boolean;
  toggleHandSwap: () => void;
  inspect: boolean;
  toggleInspect: () => void;
  jumpPrev: () => void;
  jumpNext: () => void;
  onBack: () => void;
  isSingleFrame: boolean;
  continuous: boolean;
  toggleContinuous: () => void;
}) {
  if (continuous) {
    return (
      <View
        style={[
          styles.topLeftBar,
          { backgroundColor: colors.searchBg, borderColor: colors.page },
        ]}
      >
        <IconBtn
          onPress={onBack}
          name="corner-up-left"
          color={colors.searchTxt}
        />
        <ToggleBtn
          active={true}
          onToggle={toggleContinuous}
          name="align-justify"
          activeColor={colors.accent}
          color={colors.searchTxt}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.topLeftBar,
        { backgroundColor: colors.searchBg, borderColor: colors.page },
      ]}
    >
      <IconBtn
        onPress={onBack}
        name="corner-up-left"
        color={colors.searchTxt}
      />
      <IconBtn
        onPress={jumpPrev}
        name="chevron-left"
        color={colors.searchTxt}
      />
      <IconBtn
        onPress={jumpNext}
        name="chevron-right"
        color={colors.searchTxt}
      />
      <View style={[styles.divider, { backgroundColor: colors.page }]} />
      <ToggleBtn
        active={tapFlipEnabled}
        onToggle={toggleTapFlip}
        name="loader"
        activeColor={colors.accent}
        color={colors.searchTxt}
      />
      <ToggleBtn
        active={handSwap}
        onToggle={toggleHandSwap}
        name="repeat"
        activeColor={colors.accent}
        color={colors.searchTxt}
      />
      <IconBtn
        onPress={() =>
          setOrientation(
            settings.orientation === "vertical" ? "horizontal" : "vertical"
          )
        }
        name={
          settings.orientation === "vertical" ? "arrow-down" : "arrow-right"
        }
        color={colors.searchTxt}
      />
      {canDual && (
        <ToggleBtn
          active={settings.dualInLandscape}
          onToggle={toggleDual}
          name="layout"
          activeColor={colors.accent}
          color={colors.searchTxt}
        />
      )}
      <IconBtn
        onPress={toggleFit}
        name={settings.fit === "contain" ? "maximize" : "minimize"}
        color={colors.searchTxt}
      />
      {isSingleFrame && (
        <ToggleBtn
          active={inspect}
          onToggle={toggleInspect}
          name="search"
          activeColor={colors.accent}
          color={colors.searchTxt}
        />
      )}
      <ToggleBtn
        active={false}
        onToggle={toggleContinuous}
        name="align-justify"
        activeColor={colors.accent}
        color={colors.searchTxt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topLeftBar: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 1000,
    elevation: 12,
  },
  divider: { width: 1, height: 18, opacity: 0.5, marginHorizontal: 2 },
});
