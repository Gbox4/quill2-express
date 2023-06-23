src/api/brief.ts
```typescript
import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { chatComplete } from '~/lib/chatComplete';
import { prisma } from '~/lib/db';

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  const schema = z.object({
    textFileIds: z.array(z.string()),
    query: z.string(),
  });
  const body = schema.parse(req.body);

  const textFiles = await prisma.textFile.findMany({
    where: { id: { in: body.textFileIds } }
  });

  const convo = textFiles.map(file => ({
    role: 'user',
    content: file.content,
  }));
  convo.push({
    role: 'user',
    content: body.query,
  });

  const result = await chatComplete(convo, { temperature: 0 });

  res.json({ result });
}));

export default router;