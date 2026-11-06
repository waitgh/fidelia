import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from './api.js';
import { APP_CONFIG, type SelectOption } from '../../shared/config/app-config.js';

interface SettingsContextValue {
  congregationOptions: string[];
  offeringMethodOptions: SelectOption[];
  churchName: string;
  churchAddress1: string;
  churchCity: string;
  churchState: string;
  churchZip: string;
  churchPhone: string;
  letterSigningName: string;
  letterSigningTitle: string;
  /** Saved donor letter template (shared across computers), or null if never customized. */
  donorLetterTemplate: Record<string, string> | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const defaults: SettingsContextValue = {
  congregationOptions: APP_CONFIG.congregationOptions,
  offeringMethodOptions: APP_CONFIG.offeringMethodOptions,
  churchName: '',
  churchAddress1: '',
  churchCity: '',
  churchState: '',
  churchZip: '',
  churchPhone: '',
  letterSigningName: '',
  letterSigningTitle: '',
  donorLetterTemplate: null,
  loading: true,
  reload: async () => {},
};

const SettingsContext = createContext<SettingsContextValue>(defaults);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [congregationOptions, setCongregationOptions] = useState(defaults.congregationOptions);
  const [offeringMethodOptions, setOfferingMethodOptions] = useState(defaults.offeringMethodOptions);
  const [churchName, setChurchName] = useState('');
  const [churchAddress1, setChurchAddress1] = useState('');
  const [churchCity, setChurchCity] = useState('');
  const [churchState, setChurchState] = useState('');
  const [churchZip, setChurchZip] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [letterSigningName, setLetterSigningName] = useState('');
  const [letterSigningTitle, setLetterSigningTitle] = useState('');
  const [donorLetterTemplate, setDonorLetterTemplate] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.settings.getAll();
      if (Array.isArray(data.congregationOptions)) {
        setCongregationOptions(data.congregationOptions as string[]);
      }
      if (Array.isArray(data.offeringMethodOptions)) {
        setOfferingMethodOptions(data.offeringMethodOptions as SelectOption[]);
      }
      if (typeof data.churchName === 'string') setChurchName(data.churchName);
      if (typeof data.churchAddress1 === 'string') setChurchAddress1(data.churchAddress1);
      if (typeof data.churchCity === 'string') setChurchCity(data.churchCity);
      if (typeof data.churchState === 'string') setChurchState(data.churchState);
      if (typeof data.churchZip === 'string') setChurchZip(data.churchZip);
      if (typeof data.churchPhone === 'string') setChurchPhone(data.churchPhone);
      if (typeof data.letterSigningName === 'string') setLetterSigningName(data.letterSigningName);
      if (typeof data.letterSigningTitle === 'string') setLetterSigningTitle(data.letterSigningTitle);
      const tpl = data.donorLetterTemplate;
      setDonorLetterTemplate(tpl && typeof tpl === 'object' && !Array.isArray(tpl) ? tpl as Record<string, string> : null);
    } catch {
      // fall back to static defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SettingsContext.Provider value={{
      congregationOptions, offeringMethodOptions,
      churchName, churchAddress1, churchCity, churchState, churchZip, churchPhone,
      letterSigningName, letterSigningTitle, donorLetterTemplate,
      loading, reload: load,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
