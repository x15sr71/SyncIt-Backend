import express from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { notFoundTracks } from '../controllers/notFoundTracks.controller';

const router = express.Router();

router.get('/getNotFoundTracks', sessionMiddleware, notFoundTracks);

export default router;