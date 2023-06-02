import { randomUUID } from 'crypto';
import express from 'express';
import { rm, writeFile } from 'fs/promises';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { chatComplete } from '~/lib/chatComplete';
import { prisma } from '~/lib/db';
import runPyScript from '~/lib/runPyScript';

const router = express.Router();

const upload = multer()

router.post('/', upload.none(), asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    question: z.string(),
    top_k: z.number(),
    type: z.string(),
    docs: z.array(z.object({
      id: z.number(),
      text: z.string(),
      name: z.string(),
    }))
  });
  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
  })

  const questionFile = "tmp/" + randomUUID() + ".txt";
  await writeFile(questionFile, body.question);

  const resSentences = [] as {
    sentence: string,
    score: number,
    docId: number,
  }[]

  for (const doc of body.docs) {
    const textFile = "tmp/" + randomUUID() + ".txt";
    await writeFile(textFile, doc.text);

    let rawBrief = await runPyScript("pyscripts/brief.py", [textFile, questionFile, body.top_k.toString()])
    let rawList = rawBrief.split("\n=====\n")
    // First half is sentences, second half is scores
    let sentences = rawList.slice(0, rawList.length / 2)
    let scores = rawList.slice(rawList.length / 2)

    // Add to resSentences
    for (let i = 0; i < sentences.length; i++) {
      resSentences.push({
        sentence: sentences[i],
        score: parseFloat(scores[i]),
        docId: doc.id,
      })
    }

    await rm(textFile);
  }

  await rm(questionFile);

  res.json({ sentences: resSentences })
}));

router.post("/summary", asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    sentences: z.string(),
    question: z.string(),
    // k: z.number()
  });
  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
  })
  const sentences = body.sentences

  const summary = await chatComplete([
    {
      role: "system",
      content: "You are a helpful assistant."
    },
    {
      role: "user",
      content: `Here is some text extracted from a document:\n${sentences.replaceAll("=====", "")}\n\n\nUsing the above, write a summary that answers the question. If the information is absent, say so.\n\nQuestion:\n${body.question}`
    }
  ], { gpt4: false, temperature: 0 })

  res.json({ summary })
}))

export default router;
