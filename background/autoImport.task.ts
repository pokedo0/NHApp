// background/autoImport.task.ts
import { autoImportSyncOnce } from "@/lib/autoImport";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

// Имя фоновой задачи
export const AUTO_IMPORT_TASK = "auto-import-background-task";

// defineTask ДОЛЖЕН быть в глобальной области — не внутри React-компонента!
// Иначе iOS/Android не смогут поднять JS при фоне. :contentReference[oaicite:5]{index=5}
TaskManager.defineTask(AUTO_IMPORT_TASK, async () => {
  try {
    const { discovered, sent } = await autoImportSyncOnce();
    // Можно писать в логи/аналитику при желании
    // console.log(`[AUTO-IMPORT] discovered=${discovered} sent=${sent}`);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    // console.warn("[AUTO-IMPORT] failed", e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Регистрирует/пере-регистрирует фоновую задачу.
 * minimumInterval — минимальный интервал (в минутах). ОС может запускать реже; на iOS особенно. Минимум ~15 минут. :contentReference[oaicite:6]{index=6}
 */
export async function registerAutoImportTask(minimumInterval = 15) {
  // Последняя зарегистрированная задача определяет интервал. :contentReference[oaicite:7]{index=7}
  await BackgroundTask.registerTaskAsync(AUTO_IMPORT_TASK, {
    minimumInterval,
  });
}

export async function unregisterAutoImportTask() {
  await BackgroundTask.unregisterTaskAsync(AUTO_IMPORT_TASK);
}
