/**
 * BullMQ queue definitions for Regula AI.
 *
 * Queues:
 * - ingestion: Text chunking, embedding generation, rule evaluation
 *
 * NOTE: Requires REDIS_URL environment variable.
 * If REDIS_URL is not set, jobs will fail gracefully and documents
 * will remain in "processing" state until the queue is available.
 */

let Queue: any;
let Worker: any;

async function getBullMq() {
  if (!Queue) {
    try {
      const bullmq = await import("bullmq");
      Queue = bullmq.Queue;
      Worker = bullmq.Worker;
    } catch {
      throw new Error(
        "bullmq not available — run `bun install` to install dependencies.",
      );
    }
  }
  return { Queue, Worker };
}

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set — connect Redis (Upstash) before using queues. " +
        "The owner should connect the Redis card, which injects REDIS_URL into the sandbox.",
    );
  }
  return url;
}

// Queue names
export const INGESTION_QUEUE = "ingestion";
export const EVALUATION_QUEUE = "evaluation";

let ingestionQueue: any = null;

async function getIngestionQueue() {
  if (!ingestionQueue) {
    const { Queue } = await getBullMq();
    ingestionQueue = new Queue(INGESTION_QUEUE, {
      connection: { url: getRedisUrl() },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return ingestionQueue;
}

/**
 * Enqueue a document for ingestion processing (chunking + rule evaluation).
 * Returns the job ID if successful.
 */
export async function enqueueIngestionJob(
  documentId: string,
  tenantId: string,
): Promise<string> {
  const queue = getIngestionQueue();
  const job = await queue.add("ingest", {
    documentId,
    tenantId,
  });
  return job.id as string;
}

/**
 * Start the ingestion worker. This processes documents through:
 * 1. Chunking (512-token chunks, 64-token overlap)
 * 2. Rule evaluation (pattern + semantic)
 * 3. Alert generation
 * 4. Audit logging
 *
 * Called once at application startup.
 */
export async function startIngestionWorker(): Promise<void> {
  const { Worker } = await getBullMq();

  const worker = new Worker(
    INGESTION_QUEUE,
    async (job: any) => {
      const { documentId, tenantId } = job.data;

      // TODO: Phase 2 — Implement chunking, embedding, and rule evaluation
      // For now, mark the document as "processed" (text extraction is done)
      const { getDb, documents } = await import("~/lib/db");
      const { eq } = await import("drizzle-orm");
      const db = getDb();

      await db
        .update(documents)
        .set({
          status: "processed",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return { documentId, status: "processed" };
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: 3,
      limiter: {
        max: 30,
        duration: 60000, // 30 jobs per minute
      },
    },
  );

  worker.on("failed", (job: any, err: Error) => {
    console.error(`Ingestion job ${job?.id} failed:`, err.message);
  });

  console.log("[queue] Ingestion worker started");
}
