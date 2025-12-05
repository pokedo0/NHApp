import { useCallback, useRef } from "react";
import { Animated, Easing, FlatList } from "react-native";


export const useFab = () => {
  const fabScale = useRef(new Animated.Value(0)).current;
  const fabVisibleRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  const scrollY = useRef(0);

  const animateFab = useCallback(
    (show: boolean) => {
      if (fabVisibleRef.current === show) return;
      fabVisibleRef.current = show;
      Animated.timing(fabScale, {
        toValue: show ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [fabScale]
  );

  const onScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - scrollY.current;
    scrollY.current = y;
    if (dy > 10 && y > 160) animateFab(true);
    if (dy < -10 && y < 160) animateFab(false);
  };

  const scrollTop = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

  return { fabScale, onScroll, scrollTop, listRef };
};

