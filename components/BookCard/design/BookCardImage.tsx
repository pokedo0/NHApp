import { Book } from "@/api/nhentai";
import SmartImageWithRetry from "@/components/SmartImageWithRetry";
import { buildImageFallbacks } from "@/components/buildImageFallbacks";
import { useTheme } from "@/lib/ThemeContext";
import React, { useMemo } from "react";
import { Pressable, View } from "react-native";
import { makeCardStyles } from "../BookCard.styles";

export interface BookCardImageProps {
  book: Book;
  cardWidth?: number;
  contentScale?: number;
  isFavorite?: boolean;
  onPress?: (id: number) => void;
  background?: string;
}

export default function BookCardImage({
  book,
  cardWidth = 160,
  contentScale = 1,
  onPress,
  background,
}: BookCardImageProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () => makeCardStyles(colors, cardWidth, contentScale),
    [colors, cardWidth, contentScale]
  );

  const variants = buildImageFallbacks(book.cover || book.cover);

  return (
    <Pressable
      onPress={() => onPress?.(book.id)}
      style={[
        {
          width: cardWidth,
          borderRadius: styles.card.borderRadius as number,
          overflow: "hidden",
        },
        background ? { backgroundColor: background } : null,
      ]}
    >
      <View style={styles.imageWrap}>
        <SmartImageWithRetry
          sources={variants}
          style={styles.cover}
          maxRetries={3}
          retryDelay={1000}
        />
      </View>
    </Pressable>
  );
}
