"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, isSupportedLocale, localeMeta } from "@/lib/i18n/locales";
import { loadDictionary, type MenuDictionary } from "@/lib/i18n/dictionary";
import { effectiveDictionary } from "@/lib/content/dictionary";
import { useSiteContent } from "@/components/SiteContentContext";

const STORAGE_KEY = "pressd-menu-language";

function get(dict: MenuDictionary | null, path: string): string | undefined {
  if (!dict) return undefined;
  const value = path
    .split(".")
    .reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function interpolate(value: string, vars?: Record<string, string>): string {
  if (!vars) return value;
  return Object.entries(vars).reduce((acc, [key, val]) => acc.replaceAll(`{${key}}`, val), value);
}

interface LocaleContextValue {
  locale: string;
  dir: "ltr" | "rtl";
  setLocale: (code: string) => void;
  /** Translate a dot-path key against the active dictionary. `fallback` is the
   *  literal English source text and is always what renders if the key or the
   *  whole dictionary is unavailable — customers never see a raw JSON key. */
  t: (path: string, fallback: string, vars?: Record<string, string>) => string;
  dict: MenuDictionary | null;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);
  const [loaded, setDict] = useState<{ locale: string; dict: MenuDictionary } | null>(null);
  // Published from SEO Studio: English menu text comes from the menu, other
  // languages get their translation overlay. Nothing published = the file as is.
  const site = useSiteContent();
  const dict = useMemo(
    () =>
      loaded &&
      effectiveDictionary(loaded.locale, loaded.dict, { all: site.menu, subcategoryNames: site.subcategoryNames }, site.translations[loaded.locale]),
    [loaded, site.menu, site.subcategoryNames, site.translations]
  );

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    // Reading the saved language preference has to happen client-side — an
    // external-system read, not derivable state, so an effect is right here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isSupportedLocale(stored)) setLocaleState(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDictionary(locale)
      .then((file) => {
        if (cancelled) return;
        setDict({ locale, dict: file });
      })
      .catch(() => {
        if (cancelled) return;
        // Locale file failed to load — fail safe to English rather than a broken page.
        if (locale !== DEFAULT_LOCALE) setLocaleState(DEFAULT_LOCALE);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    const next = isSupportedLocale(code) ? code : DEFAULT_LOCALE;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, etc.) — language still works for this session.
    }
  }, []);

  const t = useCallback(
    (path: string, fallback: string, vars?: Record<string, string>) =>
      interpolate(get(dict, path) ?? fallback, vars),
    [dict]
  );

  const dir = useMemo(() => localeMeta(locale).dir, [locale]);

  const value: LocaleContextValue = { locale, dir, setLocale, t, dict };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
