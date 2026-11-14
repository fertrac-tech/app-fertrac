export type DataSource = 'mock' | 'appsscript';

export interface AppConfig {
  dataSource: DataSource;
  appsScriptUrl: string;
  googleClientId: string;
  allowedDomain: string;
  privacyPolicyUrl: string;
  /** Etiqueta visible del entorno ("DEMO", "STAGING"); vacío en producción. */
  environmentLabel: string;
  version: string;
  /** SEC-05: horas que la copia local del catálogo sobrevive sin sincronizar. */
  offlineMaxHours: number;
}

type Env = Record<string, string | undefined>;

/** Lee y valida la configuración del entorno. Falla al arrancar, no a mitad de una venta. */
export function readConfig(env: Env, version: string): AppConfig {
  const dataSource = env.VITE_DATA_SOURCE === 'appsscript' ? 'appsscript' : 'mock';
  const config: AppConfig = {
    dataSource,
    appsScriptUrl: env.VITE_APPS_SCRIPT_URL ?? '',
    googleClientId: env.VITE_GOOGLE_CLIENT_ID ?? '',
    allowedDomain: env.VITE_ALLOWED_DOMAIN || 'fertrac.com',
    privacyPolicyUrl: env.VITE_PRIVACY_POLICY_URL ?? '',
    environmentLabel: env.VITE_ENV_LABEL ?? '',
    version,
    offlineMaxHours: Number(env.VITE_OFFLINE_MAX_HOURS) > 0 ? Number(env.VITE_OFFLINE_MAX_HOURS) : 24,
  };
  if (dataSource === 'appsscript') {
    const missing = [
      !/^https:\/\//.test(config.appsScriptUrl) && 'VITE_APPS_SCRIPT_URL',
      !config.googleClientId && 'VITE_GOOGLE_CLIENT_ID',
    ].filter(Boolean);
    if (missing.length > 0) throw new Error(`Configuración incompleta: falta ${missing.join(' y ')}.`);
  }
  return config;
}
