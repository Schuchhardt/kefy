import { Config } from '@remotion/cli/config';
import path from 'path';

// Explicit so `npx remotion studio|render|...` always resolve audio/image
// assets from `remotion/public/`, not the Next.js app's own `public/` at
// the project root (see scripts/deploy-remotion-lambda.ts for the Lambda
// deploy path, which sets the same option).
Config.setPublicDir(path.join(process.cwd(), 'remotion', 'public'));
