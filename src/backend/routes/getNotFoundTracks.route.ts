import express from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { validate } from '../../middlewares/validate';
import { notFoundTracksQuery } from '../validation/schemas';
import { notFoundTracks } from '../controllers/notFoundTracks.controller';

const router = express.Router();

router.get(
  '/getNotFoundTracks',
  sessionMiddleware,
  validate({ query: notFoundTracksQuery }),
  notFoundTracks,
);

export default router;
