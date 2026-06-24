/**
 * deploy-remotion-lambda.ts
 *
 * Run ONCE to deploy the Remotion Lambda function and upload the Remotion site
 * to S3. After running, copy the output values to your .env.local and Vercel
 * environment variables.
 *
 * Usage:
 *   npx tsx scripts/deploy-remotion-lambda.ts
 *
 * Reads REMOTION_AWS_* vars from .env.local automatically.
 */

// Load .env.local before anything else
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import path from 'path';
import {
  deployFunction,
  deploySite,
  getOrCreateBucket,
  getFunctions,
} from '@remotion/lambda';

const REGION     = (process.env.REMOTION_AWS_REGION ?? 'us-east-2') as Parameters<typeof deployFunction>[0]['region'];
const MEMORY_MB  = 3008;
const TIMEOUT_S  = 240;

async function main() {
  console.log('📦  Deploying Remotion to AWS Lambda...\n');
  console.log(`Region: ${REGION}`);

  // ── 1. Ensure the Remotion S3 bucket exists ─────────────────────────────────
  const { bucketName } = await getOrCreateBucket({ region: REGION });
  console.log(`✅  S3 bucket: ${bucketName}`);

  // ── 2. Deploy / update the Lambda function ──────────────────────────────────
  // IAM roles take ~10s to propagate after creation; retry up to 3 times.
  let functionName = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await deployFunction({
        region:      REGION,
        timeoutInSeconds: TIMEOUT_S,
        memorySizeInMb:   MEMORY_MB,
        createCloudWatchLogGroup: true,
        diskSizeInMb: 2048,
      });
      functionName = result.functionName;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 3 && msg.includes('cannot be assumed')) {
        console.log(`⏳  IAM propagation delay — retrying in 12s (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, 12_000));
      } else {
        throw err;
      }
    }
  }
  console.log(`✅  Lambda function: ${functionName}`);

  // ── 3. Bundle and upload the Remotion composition site to S3 ────────────────
  const entryPoint = path.join(process.cwd(), 'remotion', 'Root.tsx');
  const { serveUrl } = await deploySite({
    region:     REGION,
    bucketName,
    entryPoint,
    siteName:   'kefy-reels',
  });
  console.log(`✅  Serve URL: ${serveUrl}`);

  // ── 4. List deployed functions (sanity check) ───────────────────────────────
  const fns = await getFunctions({ region: REGION, compatibleOnly: true });
  console.log(`\n📋  Compatible functions in ${REGION}:`);
  fns.forEach((f) => console.log(`   • ${f.functionName} (${f.memorySizeInMb} MB)`));

  // ── 5. Print env vars to copy ────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Add these to .env.local and Vercel environment variables:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`REMOTION_AWS_REGION=${REGION}`);
  console.log(`REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_SERVE_URL=${serveUrl}`);
  console.log('─────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
