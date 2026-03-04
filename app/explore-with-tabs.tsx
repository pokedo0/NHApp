/**
 * Экран с свайпаемыми вкладками: Главная | Рекомендации | Скаченные | Лайкнутые | История | Персонажи.
 */
import PagerView from "@/components/PagerView";
import { SwipeableTabStrip } from "@/components/uikit/SwipeableTabStrip";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useTheme } from "@/lib/ThemeContext";
import { Feather } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { TabGridContent } from "@/components/TabGridContent";

const TABS = [
  { label: "Главная", icon: (c: string) => <Feather name="home" size={16} color={c} /> },
  { label: "Рекомендации", icon: (c: string) => <Feather name="star" size={16} color={c} /> },
  { label: "Скаченные", icon: (c: string) => <Feather name="download" size={16} color={c} /> },
  { label: "Лайкнутые", icon: (c: string) => <Feather name="heart" size={16} color={c} /> },
  { label: "История", icon: (c: string) => <Feather name="clock" size={16} color={c} /> },
  { label: "Персонажи", icon: (c: string) => <Feather name="users" size={16} color={c} /> },
];

export default function ExploreWithTabsScreen() {
  const { colors } = useTheme();
  const [pageIndex, setPageIndex] = useState(0);
  const pagerRef = useRef<any>(null);
  const gridConfig = useGridConfig();

  const onSelectIndex = useCallback((index: number) => {
    setPageIndex(index);
    pagerRef.current?.setPage?.(index);
  }, []);

  const onPageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setPageIndex(e.nativeEvent.position);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <SwipeableTabStrip
        tabs={TABS}
        selectedIndex={pageIndex}
        onSelectIndex={onSelectIndex}
        backgroundColor={colors.searchBg ?? colors.bg}
      />
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={onPageSelected}
        scrollEnabled={true}
      >
        <View style={styles.page}>
          <TabGridContent tabKey="home" gridConfig={gridConfig} />
        </View>
        <View style={styles.page}>
          <TabGridContent tabKey="recommendations" gridConfig={gridConfig} />
        </View>
        <View style={styles.page}>
          <TabGridContent tabKey="downloaded" gridConfig={gridConfig} />
        </View>
        <View style={styles.page}>
          <TabGridContent tabKey="favorites" gridConfig={gridConfig} />
        </View>
        <View style={styles.page}>
          <TabGridContent tabKey="history" gridConfig={gridConfig} />
        </View>
        <View style={styles.page}>
          <TabGridContent tabKey="characters" gridConfig={gridConfig} />
        </View>
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
