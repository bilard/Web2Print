import express from 'express';
import cors from 'cors';
import { readFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { renderComposition, type RenderOptions } from './render.js';
import { bucket, firestore } from './firebase.js';
import { verifyFirebaseToken, type AuthedRequest } from './auth.js';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY = '5mb';

const app = express();
app.use(cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type'],
}));
app.use(express.json({ limit: MAX_BODY }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/render', verifyFirebaseToken, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const renderId = nanoid(12);
  const body = req.body as {
    template?: string;
    variables?: Record<string, unknown>;
    fps?: number;
    quality?: RenderOptions['quality'];
    format?: RenderOptions['format'];
  };

  if (!body?.template || typeof body.template !== 'string') {
    res.status(400).json({ error: 'missing_template' });
    return;
  }
  if (!body.variables || typeof body.variables !== 'object') {
    res.status(400).json({ error: 'missing_variables' });
    return;
  }

  const renderDoc = firestore().doc(`renders/${renderId}`);
  await renderDoc.set({
    userId,
    template: body.template,
    status: 'running',
    createdAt: new Date().toISOString(),
  });

  try {
    const result = await renderComposition(renderId, {
      template: body.template,
      variables: body.variables,
      fps: body.fps,
      quality: body.quality,
      format: body.format,
    });

    const ext = body.format ?? 'mp4';
    const destination = `videos/${userId}/${renderId}.${ext}`;
    const file = bucket().file(destination);
    await file.save(await readFile(result.outputPath), {
      contentType: contentTypeFor(ext),
      resumable: false,
      metadata: {
        cacheControl: 'private, max-age=3600',
        metadata: { renderId, userId, template: body.template },
      },
    });

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });

    await renderDoc.update({
      status: 'done',
      storagePath: destination,
      url: signedUrl,
      durationMs: result.durationMs,
      finishedAt: new Date().toISOString(),
    });

    await result.cleanup();

    res.json({
      renderId,
      status: 'done',
      url: signedUrl,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const message = (err as Error).message;
    await renderDoc.update({
      status: 'error',
      error: message,
      finishedAt: new Date().toISOString(),
    }).catch(() => undefined);
    res.status(500).json({ renderId, status: 'error', error: message });
  }
});

app.get('/render/:id', verifyFirebaseToken, async (req: AuthedRequest, res) => {
  const snap = await firestore().doc(`renders/${req.params.id}`).get();
  if (!snap.exists) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const data = snap.data()!;
  if (data.userId !== req.userId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  res.json({ renderId: req.params.id, ...data });
});

app.listen(PORT, () => {
  console.log(`[hf-render] listening on :${PORT}`);
});

function contentTypeFor(ext: string): string {
  switch (ext) {
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    default: return 'video/mp4';
  }
}
