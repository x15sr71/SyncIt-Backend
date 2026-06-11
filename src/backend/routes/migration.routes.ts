import { Router } from 'express';
import { MigrationCronService } from '../../cron/migrationCronService';
import { MigrationCronJob } from '../../jobs/migrationCronJob';
import sessionMiddleware from '../../middlewares/sessionMiddleware';

const router = Router();

// Manual migration triggers (admin / developer use)
router.post('/trigger-all', sessionMiddleware, async (req, res) => {
  try {
    const result = await MigrationCronService.runCronJob();
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trigger-user', sessionMiddleware, async (req: any, res) => {
  const userId = req.session?.id;
  try {
    const result = await MigrationCronService.executeMigrationForUser(userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trigger-playlist', sessionMiddleware, async (req: any, res) => {
  const userId = req.session?.id;
  const { playlistId } = req.body;
  if (!playlistId) {
    return res.status(400).json({ success: false, message: 'playlistId required' });
  }
  try {
    const result = await MigrationCronService.executeMigrationForPlaylist(userId, playlistId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cron job management
router.get('/cron/status', sessionMiddleware, (_req, res) => {
  res.json({ success: true, status: MigrationCronJob.getStatus() });
});

router.post('/cron/start', sessionMiddleware, (_req, res) => {
  MigrationCronJob.start();
  res.json({ success: true, message: 'Migration cron job started' });
});

router.post('/cron/stop', sessionMiddleware, (_req, res) => {
  MigrationCronJob.stop();
  res.json({ success: true, message: 'Migration cron job stopped' });
});

export default router;
