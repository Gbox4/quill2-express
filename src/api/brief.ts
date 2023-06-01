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
    text: z.string(),
    question: z.string(),
    // k: z.number()
  });
  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
  })

  const textFile = "tmp/" + randomUUID() + ".txt";
  const questionFile = "tmp/" + randomUUID() + ".txt";
  await writeFile(textFile, body.text);
  await writeFile(questionFile, body.question);

  let sentences = await runPyScript("pyscripts/brief.py", [textFile, questionFile, "100"])
  // Make sentences at most 4000 characters long
  sentences = sentences.slice(0, 4000);
  // Remove the last sentence
  sentences = sentences.split("=====").slice(0, -1).join("=====");

  await rm(textFile);
  await rm(questionFile);

  res.json({ sentences })
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
