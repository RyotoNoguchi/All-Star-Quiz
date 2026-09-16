import 'dotenv/config';
import { deploymentErrors } from '../src/lib/server/deployment-config';
const errors = deploymentErrors(process.env);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log('Production configuration validated. Values are not printed.');
