import { deploymentErrors } from '../server/deployment-config';
const valid = {
  APP_ORIGIN: 'https://quiz.example.com',
  NEXT_PUBLIC_REALTIME_URL: 'https://quiz-rt.example.com',
  DATABASE_URL:
    'postgresql://server:secret@db.example.com/quiz?sslmode=require&sslaccept=strict',
  DIRECT_URL:
    'postgresql://server:secret@db.example.com/quiz?sslmode=require&sslaccept=strict',
  REDIS_URL: 'rediss://server:secret@redis.example.com:6379',
  REALTIME_TICKET_SECRET: 'a'.repeat(64),
  ALLOWED_ORIGINS: 'https://quiz.example.com',
  RATE_LIMIT_ENABLED: 'true',
};
it('accepts explicit TLS server configuration without exposing values in errors', () => {
  expect(deploymentErrors(valid)).toEqual([]);
  const errors = deploymentErrors({
    ...valid,
    DATABASE_URL: 'postgresql://server:do-not-log-this@db/quiz',
    REDIS_URL: 'redis://redis:6379',
  });
  expect(errors).toHaveLength(2);
  expect(errors.join()).not.toContain('do-not-log-this');
});
it('rejects placeholders, insecure browser origins, wildcard origins and disabled quotas', () => {
  expect(
    deploymentErrors({
      ...valid,
      APP_ORIGIN: 'http://localhost:3000',
      ALLOWED_ORIGINS: '*',
      REALTIME_TICKET_SECRET: 'replace-with-a-random-secret',
      RATE_LIMIT_ENABLED: 'false',
    })
  ).toHaveLength(4);
});
