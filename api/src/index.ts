import { createApp } from './app';
import { env } from './config/env';
import { installProcessSafetyNets } from './process-safety';

installProcessSafetyNets('api');

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
});
