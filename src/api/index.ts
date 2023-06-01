import express from 'express';
import MessageResponse from '~/interfaces/MessageResponse';
import brief from '~/api/brief';
import csv from '~/api/csv';
import chat from '~/api/chat';

const router = express.Router();

router.get<{}, MessageResponse>('/', (req, res) => {
  res.json({
    message: 'API - 👋🌎🌍🌏',
  });
});

router.use('/brief', brief);
router.use('/csv', csv);
router.use('/chat', chat);

export default router;
