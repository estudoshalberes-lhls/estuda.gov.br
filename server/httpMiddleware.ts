import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { NextFunction, Request, Response } from 'express';

const COMPRESSIBLE_MIME_RE =
  /^(?:text\/|application\/(?:json|javascript|xml|xhtml\+xml|svg\+xml|wasm))/i;
const MIN_COMPRESS_BYTES = 1024;

export function requestLoggerAndIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const reqId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim().slice(0, 64)) ||
    crypto.randomUUID();
  res.setHeader('X-Request-Id', reqId);

  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const logPayload = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      requestId: reqId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logPayload));
  });

  next();
}

/**
 * Lightweight zero-dependency gzip/brotli compression middleware for JSON and text payloads.
 * Automatically skips Server-Sent Events (text/event-stream) and tiny responses.
 */
export function httpCompressionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const supportsBrotli = /\bbr\b/i.test(acceptEncoding);
  const supportsGzip = /\bgzip\b/i.test(acceptEncoding);

  if (!supportsBrotli && !supportsGzip) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const existingType = String(res.getHeader('Content-Type') || '');
    if (existingType.includes('text/event-stream') || res.getHeader('Content-Encoding')) {
      return originalJson(body);
    }

    const serialized = JSON.stringify(body);
    const buffer = Buffer.from(serialized, 'utf8');
    if (buffer.byteLength < MIN_COMPRESS_BYTES) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(buffer);
    }

    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (supportsBrotli) {
      const compressed = zlib.brotliCompressSync(buffer, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
      });
      res.setHeader('Content-Encoding', 'br');
      res.setHeader('Content-Length', String(compressed.byteLength));
      return res.end(compressed);
    }

    const compressed = zlib.gzipSync(buffer, { level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', String(compressed.byteLength));
    return res.end(compressed);
  }) as Response['json'];

  const originalSend = res.send.bind(res);
  res.send = ((body?: unknown) => {
    if (
      res.headersSent ||
      res.getHeader('Content-Encoding') ||
      (typeof body !== 'string' && !Buffer.isBuffer(body))
    ) {
      return originalSend(body);
    }

    const contentType = String(res.getHeader('Content-Type') || '');
    if (contentType.includes('text/event-stream')) {
      return originalSend(body);
    }
    if (contentType && !COMPRESSIBLE_MIME_RE.test(contentType)) {
      return originalSend(body);
    }

    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    if (buffer.byteLength < MIN_COMPRESS_BYTES) {
      return originalSend(body);
    }

    res.setHeader('Vary', 'Accept-Encoding');
    if (supportsBrotli) {
      const compressed = zlib.brotliCompressSync(buffer, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
      });
      res.setHeader('Content-Encoding', 'br');
      res.setHeader('Content-Length', String(compressed.byteLength));
      return res.end(compressed);
    }

    const compressed = zlib.gzipSync(buffer, { level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', String(compressed.byteLength));
    return res.end(compressed);
  }) as Response['send'];

  next();
}

export function globalErrorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  const errObj = err as { type?: string; status?: number; statusCode?: number; message?: string };
  if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
    res.status(413).json({ error: 'O payload enviado excede o tamanho máximo permitido para esta rota.' });
    return;
  }
  if (err instanceof SyntaxError && errObj?.status === 400) {
    res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
    return;
  }

  const statusCode =
    typeof errObj?.statusCode === 'number' && errObj.statusCode >= 400 && errObj.statusCode < 600
      ? errObj.statusCode
      : 500;
  console.error('[estuda.gov.br] Erro não tratado no servidor:', errObj?.message || err);
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Erro interno ao processar a solicitação.' : errObj?.message || 'Erro na requisição.',
  });
}
