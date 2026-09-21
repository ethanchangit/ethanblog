import { assets } from './assets.generated.mjs';
import { createHandler } from './server.mjs';

export default {
  fetch: createHandler(assets),
};
