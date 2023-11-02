import express from 'express';
import { copyFile, mkdir, readFile, readdir, rm } from 'fs/promises';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { prisma } from '~/lib/db';
import runPyScript from '~/lib/runPyScript';

const router = express.Router();

const upload = multer({ dest: "uploads/" })

router.post('/create', upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw 'no file'

  const schema = z.object({
    sessionToken: z.string(),
  });
  const body = schema.parse(req.body);

  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true } } }
  })

  const fromFile = req.file.path

  const destFolder = `data/${session.user.teamId}`
  const destFile = `${destFolder}/${req.file.originalname}`

  try {
    await mkdir(destFolder)
  } catch {
    console.log("dir already exists")
  }

  await copyFile(fromFile, destFile)
  await rm(fromFile)

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

  // add common datasets
  const commonTeam = await prisma.team.findFirstOrThrow({ where: { name: "quillv2" } })
  const commonDest = `data/${commonTeam.id}`
  let commonCsvFilenames = [] as string[]
  try {
    commonCsvFilenames = await readdir(commonDest)
  } catch {
    console.log("no common dir yet")
  }

  res.json({ csvFilenames: [...csvFilenames, ...commonCsvFilenames] })
}))

router.post("/describe", asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    filename: z.string()
  });

  const body = schema.parse(req.body);

  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true } } }
  })

  const destFile = `data/${session.user.teamId}/${body.filename}`

  const cols = await runPyScript("pyscripts/csvCols.py", [destFile])
  const data = (await readFile(destFile)).toString('utf-8')

  res.json({ cols, data })
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
