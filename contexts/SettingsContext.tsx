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
  currencySymbol: string;
  setCurrencySymbol: (v: string) => void;
  countryCode: string;
  setCountryCode: (v: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const THEME_KEY = '@orderbill_theme';
const LANG_KEY  = '@orderbill_lang';
const COMPANY_NAME_KEY  = '@orderbill_company_name';
const COMPANY_PLACE_KEY = '@orderbill_company_place';
const COMPANY_PHONE_KEY = '@orderbill_company_phone';
const DEFAULT_ORDER_DESC_KEY = '@orderbill_default_order_desc';
const CURRENCY_SYMBOL_KEY = '@orderbill_currency_symbol';
const COUNTRY_CODE_KEY = '@orderbill_country_code';

const DEFAULT_COMPANY_NAME  = 'My Company';
const DEFAULT_COMPANY_PLACE = 'My City';
const DEFAULT_COMPANY_PHONE = '';
const DEFAULT_ORDER_DESC = 'Order';
const DEFAULT_CURRENCY_SYMBOL = '$';
const DEFAULT_COUNTRY_CODE = '+91';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);
  const [lang, setLangState] = useState<Lang>('en');
  const [companyName, setCompanyNameState] = useState(DEFAULT_COMPANY_NAME);
  const [companyPlace, setCompanyPlaceState] = useState(DEFAULT_COMPANY_PLACE);
  const [companyPhone, setCompanyPhoneState] = useState(DEFAULT_COMPANY_PHONE);
  const [defaultOrderDescription, setDefaultOrderDescriptionState] = useState(DEFAULT_ORDER_DESC);
  const [currencySymbol, setCurrencySymbolState] = useState(DEFAULT_CURRENCY_SYMBOL);
  const [countryCode, setCountryCodeState] = useState(DEFAULT_COUNTRY_CODE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [storedTheme, storedLang, storedCName, storedCPlace, storedCPhone, storedOrderDesc, storedCurrency, storedCountry] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(LANG_KEY),
        AsyncStorage.getItem(COMPANY_NAME_KEY),
        AsyncStorage.getItem(COMPANY_PLACE_KEY),
        AsyncStorage.getItem(COMPANY_PHONE_KEY),
        AsyncStorage.getItem(DEFAULT_ORDER_DESC_KEY),
        AsyncStorage.getItem(CURRENCY_SYMBOL_KEY),
        AsyncStorage.getItem(COUNTRY_CODE_KEY),
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
      if (storedCurrency !== null) setCurrencySymbolState(storedCurrency);
      if (storedCountry !== null) setCountryCodeState(storedCountry);
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

  const setCurrencySymbol = useCallback((v: string) => {
    setCurrencySymbolState(v);
    AsyncStorage.setItem(CURRENCY_SYMBOL_KEY, v);
  }, []);

  const setCountryCode = useCallback((v: string) => {
    setCountryCodeState(v);
    AsyncStorage.setItem(COUNTRY_CODE_KEY, v);
  }, []);

  const colors = isDark ? DarkColors : LightColors;
  const tr = translations[lang];

  if (!ready) return null;

  return (
    <SettingsContext.Provider value={{ isDark, toggleTheme, lang, setLang, colors, tr, companyName, setCompanyName, companyPlace, setCompanyPlace, companyPhone, setCompanyPhone, defaultOrderDescription, setDefaultOrderDescription, currencySymbol, setCurrencySymbol, countryCode, setCountryCode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
