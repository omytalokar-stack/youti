import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { triggerAutomationCycle } from '../services/schedulerService.js';

const router = Router();

function isAuthorizedTrigger(req, secret) {
  const authorization = req.get('authorization') || '';
  const providedSecret = req.get('x-automation-trigger-secret')
    || authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    || '';
  const expected = Buffer.from(secret);
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

router.get('/trigger', (req, res) => {
  const secret = process.env.AUTOMATION_TRIGGER_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'The automation trigger is not configured.' });
  }
  if (!isAuthorizedTrigger(req, secret)) {
    return res.status(401).json({ error: 'Unauthorized automation trigger.' });
  }

  const started = triggerAutomationCycle();
  return res.status(202).json({
    status: started ? 'accepted' : 'already-running',
    message: 'The automation cycle check is running asynchronously and will not republish a successful cycle for today.',
  });
});

export default router;
