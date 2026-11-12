// All 12 menu dictionaries (locales/<code>/menu.json), for server code and
// tests: translation validation and completeness reports. The public site
// keeps loading one language at a time (lib/i18n/dictionary.ts).

import type { MenuDictionary } from "../i18n/dictionary.ts";
import en from "../../locales/en/menu.json" with { type: "json" };
import it from "../../locales/it/menu.json" with { type: "json" };
import ar from "../../locales/ar/menu.json" with { type: "json" };
import zhCN from "../../locales/zh-CN/menu.json" with { type: "json" };
import fr from "../../locales/fr/menu.json" with { type: "json" };
import esMX from "../../locales/es-MX/menu.json" with { type: "json" };
import ko from "../../locales/ko/menu.json" with { type: "json" };
import tr from "../../locales/tr/menu.json" with { type: "json" };
import ja from "../../locales/ja/menu.json" with { type: "json" };
import ru from "../../locales/ru/menu.json" with { type: "json" };
import ml from "../../locales/ml/menu.json" with { type: "json" };
import hi from "../../locales/hi/menu.json" with { type: "json" };

export const DICTIONARIES: Readonly<Record<string, MenuDictionary>> = {
  en, it, ar, "zh-CN": zhCN, fr, "es-MX": esMX, ko, tr, ja, ru, ml, hi,
} as unknown as Record<string, MenuDictionary>;

export const ENGLISH: MenuDictionary = DICTIONARIES.en;
