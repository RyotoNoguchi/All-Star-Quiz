export const isProductionDeployment = () =>
  process.env.DEPLOYMENT_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production';
export const deploymentErrors = (
  env: Record<string, string | undefined>
): string[] => {
  const errors: string[] = [];
  const httpsOrigin = (value: string | undefined) => {
    try {
      const u = new URL(value || '');
      return (
        u.protocol === 'https:' &&
        u.origin === value &&
        !u.username &&
        !u.password &&
        !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      );
    } catch {
      return false;
    }
  };
  for (const key of ['APP_ORIGIN', 'NEXT_PUBLIC_REALTIME_URL'])
    if (!httpsOrigin(env[key]))
      errors.push(`${key} must be a public HTTPS origin`);
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    try {
      const u = new URL(env[key] || '');
      if (
        !['postgresql:', 'postgres:'].includes(u.protocol) ||
        !u.password ||
        u.searchParams.get('sslmode') !== 'require' ||
        u.searchParams.get('sslaccept') !== 'strict'
      )
        throw new Error();
    } catch {
      errors.push(
        `${key} must use PostgreSQL credentials with sslmode=require&sslaccept=strict`
      );
    }
  }
  try {
    const u = new URL(env.REDIS_URL || '');
    if (u.protocol !== 'rediss:' || !u.password) throw new Error();
  } catch {
    errors.push('REDIS_URL must use authenticated TLS (rediss://)');
  }
  if (
    !env.REALTIME_TICKET_SECRET ||
    env.REALTIME_TICKET_SECRET.length < 32 ||
    /replace-with|example|local-ui|test-secret/i.test(
      env.REALTIME_TICKET_SECRET
    )
  )
    errors.push(
      'REALTIME_TICKET_SECRET must be a unique random secret of at least 32 characters'
    );
  const origins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim());
  if (!origins.includes(env.APP_ORIGIN || '') || !origins.every(httpsOrigin))
    errors.push(
      'ALLOWED_ORIGINS must contain APP_ORIGIN and only explicit HTTPS origins'
    );
  if (env.RATE_LIMIT_ENABLED !== 'true')
    errors.push('RATE_LIMIT_ENABLED must be true');
  return errors;
};
export const assertProductionConfiguration = () => {
  if (!isProductionDeployment()) return;
  const errors = deploymentErrors(process.env);
  if (errors.length)
    throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
};
