import express from 'express';
import { Configuration, OpenAIApi } from 'openai';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { GptChat, chatComplete, chatCompleteStream } from '~/lib/chatComplete';
import { prisma } from '~/lib/db';
import { encode, decode } from 'gpt-3-encoder'
import { readFile } from 'fs/promises';


function splitIterOverlap<T>(iter: T[], chunkSize: number, overlap: number) {
    let chunks: T[][] = [];
    for (let i = 0; i < iter.length; i += chunkSize - overlap) {
        let chunk = iter.slice(i, i + chunkSize);
        chunks.push(chunk);
        if (i + chunkSize >= iter.length) {
            break;
        }
    }
    return chunks;
}

function countTokens(s: string) {
    return encode(s).length;
}

function splitByTokens(s: string, chunkSize: number, overlap: number) {
    let tokens = encode(s);
    let strings = splitIterOverlap(tokens, chunkSize, overlap).map(x => decode(x));
    return strings;
}



const router = express.Router();

router.post("/", asyncHandler(async (req, res) => {
    const schema = z.object({
        request: z.string()
    });
    const body = schema.parse(req.body);

    const fileContents = (await readFile("10k.txt")).toString()

    const chunks = splitByTokens(fileContents, 15000, 100)

    const query1 = "what debt was entered into?"

    // const query1 = "make a csv of the debt and when it was entered into"

    const results: string[] = []

    const promises = chunks.map(async (chunk) => {
        const prompt = `${chunk}

You have been given a portion of a text.

Since you are only able to see a portion of the text at a time, you must first extract the parts relavent to the user's request. These extracted parts will be used later to answer the users request, but first you must pull out any information relavent to the user's query. Make notes about the portion and how it may relate to the broader text.

USER QUERY:
${query1}`

        const convo: GptChat[] = [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ]

        const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const openai = new OpenAIApi(configuration);

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo-16k-0613",
            messages: convo,
            temperature: 0,
        });

        const data = response.data.choices[0].message?.content ?? ""
        return data
    })

    const responses = await Promise.all(promises)
    responses.forEach((data) => {
        results.push(data);
    });

    res.json({ results })
}))

export default router;
