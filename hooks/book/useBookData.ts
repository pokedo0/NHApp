import { Book, getBook, loadBookFromLocal } from "@/api/nhentai";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ToastAndroid } from "react-native";
export const useBookData = (idNum: number) => {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [local, setLocal] = useState(false);
  useEffect(() => {
    (async () => {
      const bLocal = await loadBookFromLocal(idNum);
      if (bLocal) {
        setBook(bLocal);
        setLocal(true);
        return;
      }
      try {
        setBook(await getBook(idNum));
      } catch {
        if (Platform.OS === "android")
          ToastAndroid.show("Unable to load", ToastAndroid.LONG);
        router.back();
      }
    })();
  }, [idNum, router]);
  return { book, setBook, local, setLocal };
};
