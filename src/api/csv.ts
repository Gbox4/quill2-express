import express from 'express';
import { copyFile, mkdir, readdir, rm } from 'fs/promises';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { prisma } from '~/lib/db';

const router = express.Router();

router.post('/create', asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
  });

  // TODO: Use multer to get file upload
  const filename = "uploads/a.txt"

  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true } } }
  })

  const dest = `data/${session.user.teamId}`

  try {
    await mkdir(dest)
  } catch {
    console.log("dir already exists")
  }

  await copyFile(filename, dest)
  await rm(filename)

  res.json({ success: true })
}));

router.post("/read", asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
  });

  const body = schema.parse(req.body);
  
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true } } }
  })

  const dest = `data/${session.user.teamId}`

  let csvFilenames = [] as string[]

  try {
    csvFilenames = await readdir(dest)
  } catch {
    console.log("no dir yet")
  }

  res.json({ csvFilenames })
}))

router.post("/delete", asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    filename: z.string()
  });

  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true } } }
  })

  const filepath = `data/${session.user.teamId}/${body.filename}`

  await rm(filepath)

  res.json({ success: true })
}))

export default router;
