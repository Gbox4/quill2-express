import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { chatComplete, chatCompleteStream } from '~/lib/chatComplete';
import { prisma } from '~/lib/db';

const router = express.Router();

router.post("/", asyncHandler(async (req, res) => {
    const schema = z.object({
        sessionToken: z.string(),
        prompt: z.string(),
    });
    const body = schema.parse(req.body);
    const session = await prisma.session.findFirstOrThrow({
        where: { token: body.sessionToken },
    })

    const result = await chatComplete([
        {
            role: "system",
            content: "You are a helpful assistant."
        },
        {
            role: "user",
            content: body.prompt
        }
    ], { temperature: 0 })

    res.json({ result })
}))

router.get("/stream", asyncHandler(async (req, res) => {
    console.log(req.params)
    const prompt = req.query['q']?.toString()
    if (!prompt) throw 'No q'

    const temperature = parseInt(req.query['t']?.toString() ?? "0")

    await chatCompleteStream([
        {
            role: "system",
            content: "You are a helpful assistant."
        },
        {
            role: "user",
            content: prompt
        }
    ], res, {
        temperature
    })
}))

export default router;
