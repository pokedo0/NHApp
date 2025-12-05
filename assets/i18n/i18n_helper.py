import json
import os
import re
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog

PROJECT_ROOT = r"D:\nhappandroid"

LOCALE_FILES = {
    "en": r"D:\nhappandroid\assets\i18n\en.json",
    "ja": r"D:\nhappandroid\assets\i18n\ja.json",
    "ru": r"D:\nhappandroid\assets\i18n\ru.json",
    "zh": r"D:\nhappandroid\assets\i18n\zh.json",
}

LANG_LABELS = {
    "en": "English",
    "ja": "Japanese",
    "ru": "Russian",
    "zh": "Chinese",
}

CODE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}
EXCLUDE_DIRS = {".git", "node_modules", "output_android", ".expo", "scripts"}

VSCODE_CMD = "code"

def flatten_json(obj, parent_key=""):
    items = {}
    for k, v in obj.items():
        new_key = f"{parent_key}.{k}" if parent_key else k
        if isinstance(v, dict):
            items.update(flatten_json(v, new_key))
        else:
            items[new_key] = v
    return items


def unflatten_json(flat_dict):
    root = {}
    for full_key, value in flat_dict.items():
        parts = full_key.split(".")
        d = root
        for part in parts[:-1]:
            if part not in d or not isinstance(d[part], dict):
                d[part] = {}
            d = d[part]
        d[parts[-1]] = value
    return root


class I18nModel:
    def __init__(self, locale_files):
        self.locale_files = locale_files
        self.translations = {}
        self.langs = list(locale_files.keys())

    def load(self):
        self.translations = {}
        for lang, path in self.locale_files.items():
            if not os.path.isfile(path):
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                messagebox.showerror("Ошибка чтения", f"Не удалось прочитать {path}:\n{e}")
                continue

            flat = flatten_json(data)
            for key, value in flat.items():
                if key not in self.translations:
                    self.translations[key] = {}
                self.translations[key][lang] = value

        for key in list(self.translations.keys()):
            for lang in self.langs:
                self.translations[key].setdefault(lang, "")

    def save(self):
        per_lang_flat = {lang: {} for lang in self.langs}
        for key, lang_map in self.translations.items():
            for lang in self.langs:
                text = lang_map.get(lang, "")
                per_lang_flat[lang][key] = text

        for lang, path in self.locale_files.items():
            flat = per_lang_flat.get(lang, {})
            nested = unflatten_json(flat)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(nested, f, ensure_ascii=False, indent=2)
            except Exception as e:
                messagebox.showerror("Ошибка записи", f"Не удалось записать {path}:\n{e}")

    def get_all_keys(self):
        return sorted(self.translations.keys())

    def ensure_key_exists(self, key):
        if key not in self.translations:
            self.translations[key] = {}
            for lang in self.langs:
                self.translations[key][lang] = ""

    def set_translation(self, key, lang, text):
        self.ensure_key_exists(key)
        self.translations[key][lang] = text

    def get_translation(self, key, lang):
        if key not in self.translations:
            return ""
        return self.translations[key].get(lang, "")

    def rename_key(self, old_key, new_key):
        if old_key == new_key:
            return
        if not old_key or old_key not in self.translations:
            return
        if new_key in self.translations:
            messagebox.showerror("Переименование ключа", f"Ключ '{new_key}' уже существует.")
            return
        self.translations[new_key] = self.translations.pop(old_key)

    def delete_key(self, key):
        if key in self.translations:
            del self.translations[key]

KEY_PATTERN = re.compile(r'\bt\(\s*["\']([^"\']+)["\']')


def scan_project_for_keys(root_path):
    found = set()
    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for filename in filenames:
            _, ext = os.path.splitext(filename)
            if ext.lower() not in CODE_EXTENSIONS:
                continue
            full_path = os.path.join(dirpath, filename)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue

            for match in KEY_PATTERN.findall(content):
                found.add(match)
    return found


def find_usages_of_key(root_path, key):
    usages = []
    if not key:
        return usages

    escaped_key = re.escape(key)
    pattern = re.compile(r't\s*\(\s*["\']' + escaped_key + r'["\']')

    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for filename in filenames:
            _, ext = os.path.splitext(filename)
            if ext.lower() not in CODE_EXTENSIONS:
                continue

            full_path = os.path.join(dirpath, filename)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    for lineno, line in enumerate(f, start=1):
                        match = pattern.search(line)
                        if match:
                            colno = match.start() + 1
                            snippet = line.rstrip("\n")
                            if len(snippet) > 160:
                                snippet = snippet[:157] + "..."
                            usages.append((full_path, lineno, colno, snippet))
            except Exception:
                continue

    return usages

class I18nApp:
    def __init__(self, root, model: I18nModel):
        self.root = root
        self.model = model

        self.root.title("I18n Helper")
        self.root.minsize(1100, 600)

        self.current_key = None
        self.used_keys = set()

        self.bulk_window = None
        self.bulk_text = None

        main_frame = ttk.Frame(root, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # ===== Левая панель =====
        left_frame = ttk.Frame(main_frame)
        left_frame.pack(side=tk.LEFT, fill=tk.Y)

        search_label = ttk.Label(left_frame, text="Поиск по ключу:")
        search_label.pack(anchor="w")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self.on_search_changed)
        search_entry = ttk.Entry(left_frame, textvariable=self.search_var, width=32)
        search_entry.pack(fill=tk.X, pady=(0, 6))

        self.keys_listbox = tk.Listbox(
            left_frame,
            height=30,
            exportselection=False,
            font=("Segoe UI", 9),
        )
        self.keys_listbox.pack(fill=tk.BOTH, expand=True)
        self.keys_listbox.bind("<<ListboxSelect>>", self.on_key_selected)
        self.keys_listbox.config(
            selectbackground="#4A90E2",
            selectforeground="#ffffff",
            activestyle="none",
        )

        keys_scrollbar = ttk.Scrollbar(self.keys_listbox, orient=tk.VERTICAL)
        keys_scrollbar.config(command=self.keys_listbox.yview)
        self.keys_listbox.config(yscrollcommand=keys_scrollbar.set)

        buttons_frame = ttk.Frame(left_frame)
        buttons_frame.pack(fill=tk.X, pady=(6, 0))

        sync_button = ttk.Button(buttons_frame, text="Синхронизировать", command=self.on_sync)
        sync_button.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 4))

        new_button = ttk.Button(buttons_frame, text="Новый ключ", command=self.on_new_key)
        new_button.pack(side=tk.LEFT, fill=tk.X, expand=True)

        delete_button = ttk.Button(left_frame, text="Удалить ключ", command=self.on_delete_key)
        delete_button.pack(fill=tk.X, pady=(4, 0))

        delete_unused_button = ttk.Button(
            left_frame,
            text="Удалить все Not Use",
            command=self.on_delete_unused_keys,
        )
        delete_unused_button.pack(fill=tk.X, pady=(4, 0))

        untranslated_button = ttk.Button(
            left_frame,
            text="Непереведённые",
            command=self.on_show_untranslated,
        )
        untranslated_button.pack(fill=tk.X, pady=(4, 0))

        apply_bulk_button = ttk.Button(
            left_frame,
            text="Вставить переводы",
            command=self.on_apply_bulk_translations,
        )
        apply_bulk_button.pack(fill=tk.X, pady=(4, 0))

        right_frame = ttk.Frame(main_frame)
        right_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(12, 0))

        key_frame = ttk.Frame(right_frame)
        key_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(key_frame, text="Ключ:").pack(side=tk.LEFT)

        self.key_var = tk.StringVar()
        self.key_entry = ttk.Entry(key_frame, textvariable=self.key_var)
        self.key_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0))

        copy_usage_button = ttk.Button(
            key_frame,
            text="Копировать в код",
            command=self.on_copy_usage,
        )
        copy_usage_button.pack(side=tk.LEFT, padx=(6, 0))

        copy_deps_button = ttk.Button(
            key_frame,
            text="Копировать зависимости",
            command=self.on_copy_dependencies,
        )
        copy_deps_button.pack(side=tk.LEFT, padx=(6, 0))

        open_vscode_button = ttk.Button(
            key_frame,
            text="Открыть в VSCode",
            command=self.on_open_in_vscode,
        )
        open_vscode_button.pack(side=tk.LEFT, padx=(6, 0))

        self.text_widgets = {}
        for lang in self.model.langs:
            lang_label_text = LANG_LABELS.get(lang, lang)
            frame = ttk.LabelFrame(right_frame, text=f"{lang.upper()} ({lang_label_text})")
            frame.pack(fill=tk.BOTH, expand=True, pady=(0, 6))

            txt = scrolledtext.ScrolledText(frame, wrap=tk.WORD, height=4, font=("Segoe UI", 9))
            txt.pack(fill=tk.BOTH, expand=True)
            self.text_widgets[lang] = txt

        bottom_frame = ttk.Frame(right_frame)
        bottom_frame.pack(fill=tk.X, pady=(6, 0))

        save_button = ttk.Button(bottom_frame, text="Сохранить", command=self.on_save)
        save_button.pack(side=tk.LEFT)

        save_as_button = ttk.Button(bottom_frame, text="Сохранить в другие файлы...", command=self.on_save_as)
        save_as_button.pack(side=tk.LEFT, padx=(6, 0))

        self.model.load()

        if os.path.isdir(PROJECT_ROOT):
            self.used_keys = scan_project_for_keys(PROJECT_ROOT)
        else:
            self.used_keys = set()

        self.all_keys = self.model.get_all_keys()
        self.filtered_keys = list(self.all_keys)
        self.refresh_keys_listbox()

        if self.filtered_keys:
            self.keys_listbox.selection_set(0)
            self.on_key_selected()

    def has_missing_translations(self, key):
        for lang in self.model.langs:
            text = self.model.get_translation(key, lang)
            if not text or not str(text).strip():
                return True
        return False

    def get_key_display_info(self, key):
        missing = self.has_missing_translations(key)
        unused = key not in self.used_keys

        label = key
        if unused:
            label = f"{label} [Not Use]"
        if missing:
            label = f"⚠ {label}"
        return label, missing, unused

    def refresh_keys_listbox(self):
        self.keys_listbox.delete(0, tk.END)
        for idx, key in enumerate(self.filtered_keys):
            label, missing, unused = self.get_key_display_info(key)
            self.keys_listbox.insert(tk.END, label)
            if missing:
                self.keys_listbox.itemconfig(idx, foreground="red")
            elif unused:
                self.keys_listbox.itemconfig(idx, foreground="gray")
            else:
                self.keys_listbox.itemconfig(idx, foreground="black")

    def refresh_keys_listbox_preserve_state(self):
        sel_key = self.current_key
        try:
            y_first = self.keys_listbox.yview()[0]
        except Exception:
            y_first = 0.0

        self.all_keys = self.model.get_all_keys()
        self.on_search_changed()

        if sel_key and sel_key in self.filtered_keys:
            idx = self.filtered_keys.index(sel_key)
            self.keys_listbox.selection_clear(0, tk.END)
            self.keys_listbox.selection_set(idx)
            self.keys_listbox.activate(idx)

        self.keys_listbox.yview_moveto(y_first)

    def on_search_changed(self, *args):
        text = self.search_var.get().strip().lower()
        if not text:
            self.filtered_keys = list(self.all_keys)
        else:
            self.filtered_keys = [k for k in self.all_keys if text in k.lower()]
        self.refresh_keys_listbox()

    def load_key_to_form(self, key):
        self.current_key = key
        self.key_var.set(key)
        for lang, widget in self.text_widgets.items():
            widget.delete("1.0", tk.END)
            value = self.model.get_translation(key, lang)
            widget.insert(tk.END, value)

    def save_form_to_model(self, refresh_list=True):
        if self.current_key is None and not self.key_var.get().strip():
            return

        new_key = self.key_var.get().strip()
        if not new_key:
            messagebox.showerror("Ошибка", "Ключ не может быть пустым.")
            return

        if self.current_key is None:
            self.model.ensure_key_exists(new_key)
            self.current_key = new_key
        else:
            if new_key != self.current_key:
                if self.current_key in self.used_keys:
                    self.used_keys.discard(self.current_key)
                old_key = self.current_key
                self.model.rename_key(old_key, new_key)
                self.current_key = new_key

                if not refresh_list:
                    for i, k in enumerate(self.filtered_keys):
                        if k == old_key:
                            self.filtered_keys[i] = new_key
                            label, missing, unused = self.get_key_display_info(new_key)
                            self.keys_listbox.delete(i)
                            self.keys_listbox.insert(i, label)
                            if missing:
                                self.keys_listbox.itemconfig(i, foreground="red")
                            elif unused:
                                self.keys_listbox.itemconfig(i, foreground="gray")
                            else:
                                self.keys_listbox.itemconfig(i, foreground="black")
                            break

        for lang, widget in self.text_widgets.items():
            text = widget.get("1.0", tk.END).rstrip("\n")
            self.model.set_translation(self.current_key, lang, text)

        if refresh_list:
            self.all_keys = self.model.get_all_keys()
            self.on_search_changed()

    def on_key_selected(self, event=None):
        selection = self.keys_listbox.curselection()
        if not selection:
            return
        index = selection[0]
        if index < 0 or index >= len(self.filtered_keys):
            return
        key = self.filtered_keys[index]
        if self.current_key is not None:
            self.save_form_to_model(refresh_list=False)
        self.load_key_to_form(key)

    def on_new_key(self):
        if self.current_key is not None:
            self.save_form_to_model(refresh_list=True)

        self.current_key = None
        self.key_var.set("")
        for widget in self.text_widgets.values():
            widget.delete("1.0", tk.END)

    def on_delete_key(self):
        if self.current_key is None:
            return
        key = self.current_key
        if messagebox.askyesno("Удаление ключа", f"Удалить ключ '{key}'?"):
            self.model.delete_key(key)
            if key in self.used_keys:
                self.used_keys.discard(key)

            self.current_key = None
            self.key_var.set("")
            for widget in self.text_widgets.values():
                widget.delete("1.0", tk.END)
            self.all_keys = self.model.get_all_keys()
            self.on_search_changed()

    def on_delete_unused_keys(self):
        unused_keys = [k for k in self.all_keys if k not in self.used_keys]
        if not unused_keys:
            messagebox.showinfo("Удаление Not Use", "Нет неиспользуемых ключей (Not Use).")
            return

        count = len(unused_keys)
        confirmed = messagebox.askyesno(
            "Удалить все Not Use",
            f"Будут удалены {count} неиспользуемых ключей.\nПродолжить?",
        )
        if not confirmed:
            return

        messagebox.showinfo(
            "Удаление через 3 секунды",
            "Удаление всех Not Use ключей начнётся через 3 секунды.",
        )

        def do_delete():
            if self.current_key in unused_keys:
                self.current_key = None
                self.key_var.set("")
                for widget in self.text_widgets.values():
                    widget.delete("1.0", tk.END)

            for key in unused_keys:
                self.model.delete_key(key)

            self.all_keys = self.model.get_all_keys()
            self.on_search_changed()

            messagebox.showinfo(
                "Удаление завершено",
                f"Удалено неиспользуемых ключей: {count}",
            )

        self.root.after(3000, do_delete)

    def on_sync(self):
        if self.current_key is not None:
            self.save_form_to_model(refresh_list=True)

        if not os.path.isdir(PROJECT_ROOT):
            messagebox.showerror("Ошибка", f"Корень проекта не найден:\n{PROJECT_ROOT}")
            return

        found_keys = scan_project_for_keys(PROJECT_ROOT)
        if not found_keys:
            messagebox.showinfo("Синхронизация", "Ключи t(\"...\") в проекте не найдены.")
            self.used_keys = set()
            self.refresh_keys_listbox()
            return

        self.used_keys = found_keys

        existing_keys = set(self.model.get_all_keys())
        new_keys = [k for k in found_keys if k not in existing_keys]
        for key in new_keys:
            self.model.ensure_key_exists(key)

        self.all_keys = self.model.get_all_keys()
        self.on_search_changed()

        messagebox.showinfo(
            "Синхронизация",
            f"Всего найдено ключей в коде: {len(found_keys)}\n"
            f"Новых добавлено в переводы: {len(new_keys)}",
        )

    def on_save(self):
        if self.current_key is not None or self.key_var.get().strip():
            self.save_form_to_model(refresh_list=False)
        self.model.save()
        self.refresh_keys_listbox_preserve_state()
        messagebox.showinfo("Сохранено", "Переводы сохранены в JSON-файлы.")

    def on_save_as(self):
        self.save_form_to_model(refresh_list=True)

        folder = filedialog.askdirectory(
            title="Выберите папку для сохранения копий JSON",
        )
        if not folder:
            return

        backup_paths = {}
        for lang, old_path in self.model.locale_files.items():
            filename = os.path.basename(old_path)
            backup_paths[lang] = os.path.join(folder, filename)

        backup_model = I18nModel(backup_paths)
        backup_model.translations = self.model.translations
        backup_model.langs = self.model.langs
        backup_model.save()

        messagebox.showinfo("Сохранено", f"Копии файлов переводов сохранены в:\n{folder}")

    def collect_untranslated_entries(self):
        """
        Возвращает список (key, target_lang, src_lang, src_text),
        только для ключей, которые используются в коде.
        src_lang — язык, на котором есть оригинал (приоритет en).
        """
        entries = []

        base_order = []
        if "en" in self.model.langs:
            base_order.append("en")
        base_order += [l for l in self.model.langs if l not in base_order]

        for key in self.all_keys:
            if key not in self.used_keys:
                continue

            src_lang = None
            src_text = ""

            for lang in base_order:
                txt = self.model.get_translation(key, lang)
                if txt and str(txt).strip():
                    src_lang = lang
                    src_text = str(txt)
                    break

            for lang in self.model.langs:
                if lang == src_lang:
                    continue
                text = self.model.get_translation(key, lang)
                if not text or not str(text).strip():
                    entries.append((key, lang, src_lang, src_text))

        return entries

    def on_show_untranslated(self):
        entries = self.collect_untranslated_entries()
        if not entries:
            messagebox.showinfo("Непереведённые", "Все используемые ключи переведены.")
            return

        if self.bulk_window is None or not tk.Toplevel.winfo_exists(self.bulk_window):
            self.bulk_window = tk.Toplevel(self.root)
            self.bulk_window.title("Массовый перевод")
            self.bulk_window.geometry("900x450")

            info_label = ttk.Label(
                self.bulk_window,
                text="Формат: key|lang|перевод  # src: язык: оригинал. "
                     "Меняй только часть 'перевод'.",
            )
            info_label.pack(anchor="w", padx=10, pady=(10, 5))

            self.bulk_text = scrolledtext.ScrolledText(
                self.bulk_window,
                wrap=tk.WORD,
                font=("Segoe UI", 9),
            )
            self.bulk_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

            def on_close():
                self.bulk_window.destroy()
                self.bulk_window = None
                self.bulk_text = None

            self.bulk_window.protocol("WM_DELETE_WINDOW", on_close)

        lines = []
        for key, lang, src_lang, src in entries:
            safe_src = (src or "").replace("\n", " ").strip()
            if src_lang and safe_src:
                src_part = f"{src_lang}: {safe_src}"
            else:
                src_part = ""
            lines.append(f"{key}|{lang}|  # src: {src_part}")

        text_block = "\n".join(lines)

        self.bulk_text.delete("1.0", tk.END)
        self.bulk_text.insert(tk.END, text_block)

        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(text_block)
            self.root.update()
        except Exception:
            pass

        messagebox.showinfo(
            "Непереведённые",
            "Список непереведённых строк сформирован и скопирован в буфер обмена.",
        )

    def on_apply_bulk_translations(self):
        """
        Берёт данные из окна массового перевода.
        Если окно пустое/закрыто — пробует прочитать текст из буфера обмена.
        Формат строки:
          key|lang|перевод  # src: ...
        """
        content = ""
        if self.bulk_text is not None:
            content = self.bulk_text.get("1.0", tk.END).strip()

        if not content:
            try:
                content = self.root.clipboard_get()
            except Exception:
                content = ""

        if not content:
            messagebox.showerror(
                "Массовый перевод",
                "Нет данных для применения. Открой «Непереведённые» или скопируй текст в буфер.",
            )
            return

        changed = 0

        for raw_line in content.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split("|", 3)
            if len(parts) < 3:
                continue

            key = parts[0].strip()
            lang = parts[1].strip()
            if not key or lang not in self.model.langs:
                continue

            rest = parts[2].strip()
            if " # " in rest:
                rest = rest.split(" # ", 1)[0].rstrip()

            translation = rest.strip()
            if not translation:
                continue

            self.model.set_translation(key, lang, translation)
            changed += 1

        if changed == 0:
            messagebox.showinfo("Массовый перевод", "Не найдено строк с переводами.")
        else:
            if self.current_key:
                self.load_key_to_form(self.current_key)
            self.refresh_keys_listbox()
            messagebox.showinfo(
                "Массовый перевод",
                f"Обновлено переводов: {changed}",
            )

    def on_copy_usage(self):
        key = self.key_var.get().strip()
        if not key:
            messagebox.showerror("Копирование", "Нет выбранного ключа.")
            return

        text = f'{{t("{key}")}}'
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.root.update()
            messagebox.showinfo("Копирование", f"Скопировано в буфер:\n{text}")
        except Exception as e:
            messagebox.showerror("Копирование", f"Не удалось скопировать в буфер:\n{e}")

    def on_copy_dependencies(self):
        deps = (
            'import { useI18n } from "@/lib/i18n/I18nContext";\n'
            "const { t } = useI18n();"
        )
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(deps)
            self.root.update()
            messagebox.showinfo("Копирование", "Зависимости скопированы в буфер обмена.")
        except Exception as e:
            messagebox.showerror("Копирование", f"Не удалось скопировать в буфер:\n{e}")

    def on_open_in_vscode(self):
        key = self.key_var.get().strip()
        if not key:
            messagebox.showerror("Открытие в VSCode", "Нет выбранного ключа.")
            return

        if not os.path.isdir(PROJECT_ROOT):
            messagebox.showerror("Открытие в VSCode", f"Корень проекта не найден:\n{PROJECT_ROOT}")
            return

        usages = find_usages_of_key(PROJECT_ROOT, key)
        if not usages:
            messagebox.showinfo(
                "Открытие в VSCode",
                f"В проекте не найдено вхождений t(\"{key}\").",
            )
            return

        if len(usages) == 1:
            full_path, lineno, colno, _ = usages[0]
            self._open_vscode_location(full_path, lineno, colno)
            return

        self._show_usages_dialog(key, usages)

    def _open_vscode_location(self, full_path, lineno, colno):
        import shutil
        vscode_paths = [
            shutil.which("code"),
            shutil.which("code-insiders"),
            r"C:\Users\{}\AppData\Local\Programs\Microsoft VS Code Insiders\code-insiders.exe".format(os.getenv("USERNAME")),
            r"C:\Program Files\Microsoft VS Code Insiders\code-insiders.exe",
            r"C:\Users\{}\AppData\Local\Programs\Microsoft VS Code\code.exe".format(os.getenv("USERNAME")),
            r"C:\Program Files\Microsoft VS Code\code.exe",
        ]

        cmd = None
        for path in vscode_paths:
            if path and os.path.isfile(path):
                cmd = path
                break

        if not cmd:
            messagebox.showerror("VSCode", "VS Code не найден в системе.")
            return

        arg = f"{full_path}:{lineno}:{colno}"
        try:
            subprocess.run([cmd, "-g", arg], check=False)
        except Exception as e:
            messagebox.showerror("VSCode", f"Ошибка запуска:\n{e}")

    def _show_usages_dialog(self, key, usages):
        top = tk.Toplevel(self.root)
        top.title(f"Вхождения для {key}")
        top.geometry("800x320")

        label = ttk.Label(
            top,
            text=f"Найдено {len(usages)} вхождений t(\"{key}\"). Выбери, куда перейти:",
        )
        label.pack(anchor="w", padx=10, pady=(10, 5))

        listbox = tk.Listbox(top, width=120, height=10, font=("Segoe UI", 9))
        listbox.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 5))

        scrollbar = ttk.Scrollbar(listbox, orient=tk.VERTICAL)
        scrollbar.config(command=listbox.yview)
        listbox.config(yscrollcommand=scrollbar.set)

        for i, (full_path, lineno, colno, snippet) in enumerate(usages):
            rel = os.path.relpath(full_path, PROJECT_ROOT)
            display = f"{rel}:{lineno}:{colno}  |  {snippet}"
            listbox.insert(tk.END, display)

        def open_selected():
            sel = listbox.curselection()
            if not sel:
                messagebox.showerror("Открытие", "Не выбрано ни одного элемента.")
                return
            idx = sel[0]
            full_path, lineno, colno, _ = usages[idx]
            self._open_vscode_location(full_path, lineno, colno)
            top.destroy()

        def on_double_click(event):
            open_selected()

        listbox.bind("<Double-Button-1>", on_double_click)

        btn_frame = ttk.Frame(top)
        btn_frame.pack(fill=tk.X, padx=10, pady=(5, 10))

        open_btn = ttk.Button(btn_frame, text="Открыть", command=open_selected)
        open_btn.pack(side=tk.LEFT)

        close_btn = ttk.Button(btn_frame, text="Закрыть", command=top.destroy)
        close_btn.pack(side=tk.RIGHT)


def main():
    root = tk.Tk()
    model = I18nModel(LOCALE_FILES)
    app = I18nApp(root, model)
    root.mainloop()


if __name__ == "__main__":
    main()
