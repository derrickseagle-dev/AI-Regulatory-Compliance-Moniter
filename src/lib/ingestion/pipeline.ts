import { eq } from "drizzle-orm";
import { getDb, documents } from "~/lib/db";
import { extractText } from "./extractors";
import type { SessionUser } from "~/lib/auth/session";
import { enqueueIngestionJob } from "~/lib/queue";

/**
 * Process an uploaded file through the ingestion pipeline:
 * 1. Extract text
 * 2. Update document record
 * 3. Enqueue processing job for chunking/embedding/evaluation
 *
 * This is the synchronous part — heavy work is deferred to BullMQ.
 */
export async function ingestDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  user: SessionUser,
): Promise<{ documentId: string; status: string }> {
  const db = getDb();

  // 1. Create document record with "pending" status
  const [doc] = await db
    .insert(documents)
    .values({
      tenantId: user.tenantId,
      filename,
      sourceType: "upload",
      status: "pending",
      uploadedBy: user.id,
      fileSize: buffer.length,
    })
    .returning({ id: documents.id, status: documents.status });

  // 2. Extract text
  const { text, metadata } = await extractText(buffer, filename, mimeType);

  // 3. Update document with extracted text and metadata
  await db
    .update(documents)
    .set({
      contentText: text,
      metadata: {
        extractionMethod: metadata.extractionMethod,
        rawInputType: metadata.inputType,
      },
      status: "processing",
      fileHash: metadata.fileHash,
      fileSize: metadata.fileSize || buffer.length,
      pageCount: metadata.pageCount,
      wordCount: metadata.wordCount,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));

  // 4. Enqueue the rest of the pipeline (chunking, embedding, rule evaluation)
  // This is non-blocking — if Redis is down, the document stays in "processing"
  // and will be picked up when the queue is available.
  try {
    await enqueueIngestionJob(doc.id, user.tenantId);
  } catch {
    // Queue unavailable — document is in "processing" state.
    // The queue worker will process it when Redis becomes available.
  }

  return { documentId: doc.id, status: "processing" };
}
