import React, {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { LightColors, DarkColors, AppColors } from '@/constants/theme';
import { translations, Lang } from '@/constants/translations';

interface SettingsContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  colors: AppColors;
  tr: typeof translations['en'];
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const THEME_KEY = '@mfc_theme';
const LANG_KEY  = '@mfc_lang';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);
  const [lang, setLangState] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [storedTheme, storedLang] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(LANG_KEY),
      ]);
      if (storedTheme !== null) {
        setIsDark(storedTheme === 'dark');
      } else {
        setIsDark(systemScheme === 'dark');
      }
      if (storedLang === 'en' || storedLang === 'ta') {
        setLangState(storedLang);
      }
      setReady(true);
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l);
  }, []);

  const colors = isDark ? DarkColors : LightColors;
  const tr = translations[lang];

  if (!ready) return null;

  return (
    <SettingsContext.Provider value={{ isDark, toggleTheme, lang, setLang, colors, tr }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
