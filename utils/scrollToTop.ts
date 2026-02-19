import { Platform } from "react-native";
export function scrollToTop(scrollRef?: React.RefObject<any> | null) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body) {
        document.body.scrollTop = 0;
      }
    }
  }
  if (scrollRef?.current) {
    try {
      if (scrollRef.current.scrollToOffset) {
        scrollRef.current.scrollToOffset({ offset: 0, animated: true });
      } else if (scrollRef.current.scrollToLocation) {
        scrollRef.current.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true });
      } else if (scrollRef.current.scrollTo) {
        scrollRef.current.scrollTo({ y: 0, animated: true });
      } else if (typeof scrollRef.current === "function") {
        scrollRef.current({ offset: 0, animated: true });
      }
    } catch (error) {
      try {
        if (scrollRef.current.scrollToOffset) {
          scrollRef.current.scrollToOffset({ offset: 0, animated: false });
        } else if (scrollRef.current.scrollToLocation) {
          scrollRef.current.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: false });
        } else if (scrollRef.current.scrollTo) {
          scrollRef.current.scrollTo({ y: 0, animated: false });
        }
      } catch (fallbackError) {
        console.warn("Failed to scroll to top:", fallbackError);
      }
    }
  }
}