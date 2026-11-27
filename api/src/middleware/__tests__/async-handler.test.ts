import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { asyncHandler } from '../async-handler';
import { errorHandler } from '../error';

describe('asyncHandler', () => {
  it('forwards a rejected async handler to next', async () => {
    const err = new Error('boom');
    let received: unknown;
    const next = (e?: unknown) => {
      received = e;
    };
    asyncHandler(async () => {
      throw err;
    })({} as never, {} as never, next as never);
    await new Promise((r) => setImmediate(r));
    expect(received).toBe(err);
  });

  it('a throwing async route returns a clean 500 instead of hanging', async () => {
    const app = express();
    app.get(
      '/boom',
      asyncHandler(async () => {
        throw new Error('kaboom with sql detail');
      }),
    );
    app.use(errorHandler);

    // errorHandler logs the error server-side (correct); silence the expected
    // noise here and assert it happened.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'internal server error' }); // no leak
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('does not interfere with a successful async handler', async () => {
    const app = express();
    app.get(
      '/ok',
      asyncHandler(async (_req, res) => {
        res.json({ ok: true });
      }),
    );
    app.use(errorHandler);

    const res = await request(app).get('/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
