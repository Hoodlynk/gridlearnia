export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8080', 10),

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  // Frontend origin — used to build links in outbound emails
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',

  mail: {
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
    // EU-hosted Mailgun domains: https://api.eu.mailgun.net
    baseUrl: process.env.MAILGUN_BASE_URL ?? 'https://api.mailgun.net',
    from: process.env.EMAIL_FROM,
  },

  storage: {
    region: process.env.DO_SPACES_REGION ?? 'nyc3',
    endpoint: process.env.DO_SPACES_ENDPOINT,
    key: process.env.DO_SPACES_KEY,
    secret: process.env.DO_SPACES_SECRET,
    bucket: process.env.DO_SPACES_BUCKET,
    // The bucket is shared with other apps — everything this API stores
    // lives under this top-level folder.
    rootPrefix: process.env.DO_SPACES_ROOT_PREFIX ?? 'Gridlearnia',
  },

  throttle: {
    ttlMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
    limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),
  },
});
