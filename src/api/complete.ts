import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { chatComplete } from '~/lib/chatComplete';
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
    ], {temperature: 0})

    res.json({ result })
}))

export default router;
