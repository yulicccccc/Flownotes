/**
 * FlowNotes v3.7.0 — Live Clipboard Catch API
 * Deployed as Cloudflare Pages Function at /api/clipboard
 */

let memoryStore = null;

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const text = (body.text || '').toString().trim();
    if (!text) {
      return new Response(JSON.stringify({ error: 'Text content is empty' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const payload = {
      id: body.id || 'clip_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      text: text,
      timestamp: body.timestamp || Date.now(),
      source: body.source || 'windows_client',
      title: body.title || ''
    };

    // 优先存储至 Cloudflare KV，同时留存内存兜底
    if (env && env.FLOWNOTES_CLIPBOARD) {
      await env.FLOWNOTES_CLIPBOARD.put('latest_clipboard', JSON.stringify(payload), {
        expirationTtl: 86400 // 缓存保留 24 小时
      });
    }
    memoryStore = payload;

    return new Response(JSON.stringify({ success: true, payload }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

export async function onRequestGet({ request, env }) {
  try {
    let payload = memoryStore;

    if (env && env.FLOWNOTES_CLIPBOARD) {
      const kvVal = await env.FLOWNOTES_CLIPBOARD.get('latest_clipboard');
      if (kvVal) {
        try {
          payload = JSON.parse(kvVal);
        } catch (_) {}
      }
    }

    if (!payload) {
      payload = {
        id: 'init',
        text: '',
        timestamp: 0,
        source: 'none'
      };
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}
