// Configuración central de bowa, leída desde variables de entorno.
export function loadConfig(env = process.env) {
  return {
    whatsapp: {
      token: env.WHATSAPP_TOKEN ?? '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
      verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
      appSecret: env.WHATSAPP_APP_SECRET ?? '',
    },
    encryptionKey: env.BOWA_ENCRYPTION_KEY ?? '',
    radicadoPrefix: env.BOWA_RADICADO_PREFIX || 'BOWA',
    defaultCountryCode: env.BOWA_DEFAULT_COUNTRY_CODE || '57',
    ratePerSecond: Number(env.BOWA_RATE_PER_SECOND || 10),
    timezone: env.BOWA_TIMEZONE || 'America/Bogota',
    storePath: env.BOWA_STORE_PATH || 'data/bowa.store',
    port: Number(env.PORT || 3000),
  };
}

export function requireKeys(config, keys) {
  const missing = keys.filter((k) => !k.split('.').reduce((o, p) => o?.[p], config));
  if (missing.length) throw new Error(`Faltan variables de configuración: ${missing.join(', ')}`);
}
