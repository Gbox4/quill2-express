import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { chatComplete } from '~/lib/chatComplete';
import { prisma } from '~/lib/db';
import { Configuration, OpenAIApi } from "openai";
import axios from 'axios';

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

router.post("/stream", asyncHandler(async (req, res) => {

    // const configuration = new Configuration({
    //     apiKey: process.env.OPENAI_API_KEY,
    // });
    // const openai = new OpenAIApi(configuration);
    // const response = await openai.createChatCompletion({
    //     model: "gpt-3.5-turbo",
    //     messages: [
    //         {
    //             role: "system",
    //             content: "You are a helpful assistant."
    //         },
    //         {
    //             role: "user",
    //             content: "Write a paragraph about Rome"
    //         }
    //     ],
    //     temperature: 0,
    //     stream: true,
    // })

    // console.log(response.data)

    const data = {
        model: "gpt-3.5-turbo",
        messages: [{ "role": "user", "content": "Hello!" }]
    };


    axios({
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
        },
        data: data
    })
        .then(response => {
            console.log(response.data);
        })
        .catch(error => {
            console.error(error);
        });


    res.send("ok")
}))

export default router;
