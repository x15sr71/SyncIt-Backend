import { SessionData } from '../middlewares/sessionMiddleware';

declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
      _sessionChecked?: boolean;
    }
  }
}
