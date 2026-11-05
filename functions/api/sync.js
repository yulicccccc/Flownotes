/**
 * FlowNotes v3.8.0 — Zero-Config Cloud Sync API
 * Deployed as Cloudflare Pages Function at /api/sync
 * Provides instantaneous, cross-device two-way sync between Windows PC and iPad/Web
 * with zero required configuration, zero passwords, and zero GitHub PAT friction.
 */

let memoryBackupStore = null;

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
    const payload = await request.json();
    if (!payload || (!payload.mapsManifest && !payload.nodes && !payload.allMapsData)) {
      return new Response(JSON.stringify({ error: 'Invalid backup payload: missing maps or nodes' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const updatedAtMs = payload.updatedAtMs || Date.now();
    payload.updatedAtMs = updatedAtMs;

    // 计算统计指标
    let totalNodes = 0;
    let totalMaps = 0;
    if (Array.isArray(payload.mapsManifest)) {
      totalMaps = payload.mapsManifest.length;
      totalNodes = payload.mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0);
    } else if (Array.isArray(payload.nodes)) {
      totalNodes = payload.nodes.length;
      totalMaps = 1;
    }

    const meta = {
      exists: true,
      updatedAtMs: updatedAtMs,
      totalNodes: totalNodes,
      totalMaps: totalMaps,
      activeMapId: payload.activeMapId || 'map_default',
      version: payload.version || 'FlowNotes-MultiMap-3.8.0',
      clientSource: payload.clientSource || 'web'
    };

    const payloadStr = JSON.stringify(payload);

    // 持久化到 Cloudflare KV (无 expirationTtl 即永久安全留存)
    if (env && env.FLOWNOTES_CLIPBOARD) {
      await env.FLOWNOTES_CLIPBOARD.put('flownotes_latest_backup', payloadStr);
      await env.FLOWNOTES_CLIPBOARD.put('flownotes_backup_meta', JSON.stringify(meta));
    }
    memoryBackupStore = { payload, meta };

    return new Response(JSON.stringify({ success: true, meta }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal sync error' }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const metaOnly = url.searchParams.get('meta') === '1';

    // 优先从 Cloudflare KV 读取
    if (env && env.FLOWNOTES_CLIPBOARD) {
      if (metaOnly) {
        const metaVal = await env.FLOWNOTES_CLIPBOARD.get('flownotes_backup_meta');
        if (metaVal) {
          return new Response(metaVal, { status: 200, headers: CORS_HEADERS });
        }
      }

      const backupVal = await env.FLOWNOTES_CLIPBOARD.get('flownotes_latest_backup');
      if (backupVal) {
        if (metaOnly) {
          try {
            const parsed = JSON.parse(backupVal);
            const totalNodes = parsed.mapsManifest ? parsed.mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0) : (parsed.nodes || []).length;
            const totalMaps = parsed.mapsManifest ? parsed.mapsManifest.length : 1;
            return new Response(JSON.stringify({
              exists: true,
              updatedAtMs: parsed.updatedAtMs || 0,
              totalNodes,
              totalMaps
            }), { status: 200, headers: CORS_HEADERS });
          } catch (_) {}
        }
        return new Response(backupVal, { status: 200, headers: CORS_HEADERS });
      }
    }

    // 内存兜底
    if (memoryBackupStore) {
      if (metaOnly) {
        return new Response(JSON.stringify(memoryBackupStore.meta), { status: 200, headers: CORS_HEADERS });
      }
      return new Response(JSON.stringify(memoryBackupStore.payload), { status: 200, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ exists: false, totalNodes: 0, totalMaps: 0 }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal sync error' }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}
