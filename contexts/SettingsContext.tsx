import { AppColors, DarkColors, LightColors } from '@/constants/theme';
import { Lang, translations } from '@/constants/translations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useColorScheme } from 'react-native';

interface SettingsContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  colors: AppColors;
  tr: typeof translations['en'];
  companyName: string;
  setCompanyName: (v: string) => void;
  companyPlace: string;
  setCompanyPlace: (v: string) => void;
  companyPhone: string;
  setCompanyPhone: (v: string) => void;
  defaultOrderDescription: string;
  setDefaultOrderDescription: (v: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const THEME_KEY = '@mfc_theme';
const LANG_KEY  = '@mfc_lang';
const COMPANY_NAME_KEY  = '@mfc_company_name';
const COMPANY_PLACE_KEY = '@mfc_company_place';
const COMPANY_PHONE_KEY = '@mfc_company_phone';
const DEFAULT_ORDER_DESC_KEY = '@mfc_default_order_desc';

const DEFAULT_COMPANY_NAME  = 'My Company';
const DEFAULT_COMPANY_PLACE = 'My City';
const DEFAULT_COMPANY_PHONE = '';
const DEFAULT_ORDER_DESC = 'Order';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);
  const [lang, setLangState] = useState<Lang>('en');
  const [companyName, setCompanyNameState] = useState(DEFAULT_COMPANY_NAME);
  const [companyPlace, setCompanyPlaceState] = useState(DEFAULT_COMPANY_PLACE);
  const [companyPhone, setCompanyPhoneState] = useState(DEFAULT_COMPANY_PHONE);
  const [defaultOrderDescription, setDefaultOrderDescriptionState] = useState(DEFAULT_ORDER_DESC);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [storedTheme, storedLang, storedCName, storedCPlace, storedCPhone, storedOrderDesc] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(LANG_KEY),
        AsyncStorage.getItem(COMPANY_NAME_KEY),
        AsyncStorage.getItem(COMPANY_PLACE_KEY),
        AsyncStorage.getItem(COMPANY_PHONE_KEY),
        AsyncStorage.getItem(DEFAULT_ORDER_DESC_KEY),
      ]);
      if (storedTheme !== null) {
        setIsDark(storedTheme === 'dark');
      } else {
        setIsDark(systemScheme === 'dark');
      }
      if (storedLang === 'en' || storedLang === 'ta') {
        setLangState(storedLang);
      }
      if (storedCName !== null) setCompanyNameState(storedCName);
      if (storedCPlace !== null) setCompanyPlaceState(storedCPlace);
      if (storedCPhone !== null) setCompanyPhoneState(storedCPhone);
      if (storedOrderDesc !== null) setDefaultOrderDescriptionState(storedOrderDesc);
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

  const setCompanyName = useCallback((v: string) => {
    setCompanyNameState(v);
    AsyncStorage.setItem(COMPANY_NAME_KEY, v);
  }, []);

  const setCompanyPlace = useCallback((v: string) => {
    setCompanyPlaceState(v);
    AsyncStorage.setItem(COMPANY_PLACE_KEY, v);
  }, []);

  const setCompanyPhone = useCallback((v: string) => {
    setCompanyPhoneState(v);
    AsyncStorage.setItem(COMPANY_PHONE_KEY, v);
  }, []);

  const setDefaultOrderDescription = useCallback((v: string) => {
    setDefaultOrderDescriptionState(v);
    AsyncStorage.setItem(DEFAULT_ORDER_DESC_KEY, v);
  }, []);

  const colors = isDark ? DarkColors : LightColors;
  const tr = translations[lang];

  if (!ready) return null;

  return (
    <SettingsContext.Provider value={{ isDark, toggleTheme, lang, setLang, colors, tr, companyName, setCompanyName, companyPlace, setCompanyPlace, companyPhone, setCompanyPhone, defaultOrderDescription, setDefaultOrderDescription }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
