/**
 * FlowNotes v4.1.0 — Ironclad Cloud Backup Vault & Anti-Wipe Sync API
 * Deployed as Cloudflare Pages Function at /api/sync
 * Features:
 *   - Accurate multi-map node counting
 *   - Anti-wipe cliff-drop circuit breaker (HTTP 409)
 *   - Rolling 15-version Time-Machine snapshots (flownotes_history_index / flownotes_snap_*)
 *   - Immortal Peak Backup Vault (flownotes_peak_backup / flownotes_peak_meta)
 */

let memoryBackupStore = null;
let memoryPeakStore = null;
let memoryHistoryIndex = [];
const memorySnapshots = new Map();

const MAX_HISTORY_SNAPSHOTS = 15;

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function computePayloadStats(payload) {
  if (!payload || typeof payload !== 'object') {
    return { totalNodes: 0, totalMaps: 0 };
  }
  let totalNodes = 0;
  let totalMaps = 0;
  const countedMapIds = new Set();

  if (payload.allMapsData && typeof payload.allMapsData === 'object') {
    for (const k of Object.keys(payload.allMapsData)) {
      const md = payload.allMapsData[k];
      if (md && Array.isArray(md.nodes)) {
        totalNodes += md.nodes.length;
        countedMapIds.add(k);
        totalMaps++;
      }
    }
  }
  if (Array.isArray(payload.mapsManifest)) {
    totalMaps = Math.max(totalMaps, payload.mapsManifest.length);
    for (const m of payload.mapsManifest) {
      if (m && m.id && !countedMapIds.has(m.id)) {
        totalNodes += (m.nodeCount || 0);
      }
    }
  }
  if (totalMaps === 0 && Array.isArray(payload.nodes)) {
    totalNodes = payload.nodes.length;
    totalMaps = 1;
  }
  return { totalNodes, totalMaps };
}

function safeJsonParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

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

    const forceOverwrite = !!payload.forceOverwrite;
    if ('forceOverwrite' in payload) {
      delete payload.forceOverwrite;
    }

    const updatedAtMs = payload.updatedAtMs || Date.now();
    payload.updatedAtMs = updatedAtMs;

    const { totalNodes: incomingTotalNodes, totalMaps: incomingTotalMaps } = computePayloadStats(payload);

    const kv = env && env.FLOWNOTES_CLIPBOARD ? env.FLOWNOTES_CLIPBOARD : null;

    // 1. 读取云端现有备份及统计指标
    let existingBackupStr = null;
    let existingMeta = null;
    if (kv) {
      existingBackupStr = await kv.get('flownotes_latest_backup');
      existingMeta = safeJsonParse(await kv.get('flownotes_backup_meta'));
    } else if (memoryBackupStore) {
      existingBackupStr = JSON.stringify(memoryBackupStore.payload);
      existingMeta = memoryBackupStore.meta;
    }

    if (existingBackupStr) {
      const existingParsed = safeJsonParse(existingBackupStr);
      if (existingParsed) {
        const computedExisting = computePayloadStats(existingParsed);
        existingMeta = {
          ...(existingMeta || {}),
          exists: true,
          updatedAtMs: existingMeta?.updatedAtMs || existingParsed.updatedAtMs || Date.now(),
          totalNodes: Math.max(computedExisting.totalNodes, existingMeta?.totalNodes || 0),
          totalMaps: Math.max(computedExisting.totalMaps, existingMeta?.totalMaps || 0),
          clientSource: existingMeta?.clientSource || existingParsed.clientSource || 'web'
        };
      }
    }

    // 2. 服务端防误删 / 卡片差大于 10 或骤降 >50% 熔断器 (HTTP 409 Conflict)
    const existingNodes = existingMeta ? (existingMeta.totalNodes || 0) : 0;
    const nodeDiff = existingNodes - incomingTotalNodes;
    const isLargeDrop = nodeDiff > 10 || (existingNodes >= 8 && incomingTotalNodes < existingNodes * 0.5);
    if (isLargeDrop && !forceOverwrite) {
      return new Response(JSON.stringify({
        error: 'CLOUD_SHRINK_PROTECTED',
        existingNodes,
        incomingNodes: incomingTotalNodes,
        diff: nodeDiff,
        message: `云端防误删熔断：云端已有 ${existingNodes} 张卡片，本次仅有 ${incomingTotalNodes} 张（减少 ${nodeDiff} 张，超过 10 张安全阈值），已拦截自动覆盖`
      }), {
        status: 409,
        headers: CORS_HEADERS
      });
    }

    // 3. 覆盖前自动将旧版归档进滚动历史快照 (最多保留 15 个历史版本)
    if (existingBackupStr && existingMeta && (existingMeta.totalNodes || 0) > 0) {
      let historyIndex = kv
        ? (safeJsonParse(await kv.get('flownotes_history_index'), []) || [])
        : [...memoryHistoryIndex];
      if (!Array.isArray(historyIndex)) historyIndex = [];

      const existingStamp = existingMeta.updatedAtMs || Date.now();
      const topSnap = historyIndex[0];
      const shouldSnapshot =
        historyIndex.length === 0 ||
        topSnap.totalNodes !== existingMeta.totalNodes ||
        Math.abs(existingStamp - (topSnap.updatedAtMs || 0)) >= 60000;

      if (shouldSnapshot) {
        const snapKey = `flownotes_snap_${existingStamp}`;
        const snapEntry = {
          key: snapKey,
          updatedAtMs: existingStamp,
          totalNodes: existingMeta.totalNodes,
          totalMaps: existingMeta.totalMaps || 1,
          clientSource: existingMeta.clientSource || 'web'
        };

        if (kv) {
          await kv.put(snapKey, existingBackupStr);
        } else {
          memorySnapshots.set(snapKey, existingBackupStr);
        }

        historyIndex = [snapEntry, ...historyIndex.filter(it => it && it.key !== snapKey)];
        const evicted = historyIndex.slice(MAX_HISTORY_SNAPSHOTS);
        historyIndex = historyIndex.slice(0, MAX_HISTORY_SNAPSHOTS);

        if (kv) {
          for (const ev of evicted) {
            if (ev && ev.key && ev.key.startsWith('flownotes_snap_')) {
              await kv.delete(ev.key).catch(() => {});
            }
          }
          await kv.put('flownotes_history_index', JSON.stringify(historyIndex));
        } else {
          for (const ev of evicted) {
            if (ev && ev.key) memorySnapshots.delete(ev.key);
          }
          memoryHistoryIndex = historyIndex;
        }
      }
    }

    const meta = {
      exists: true,
      updatedAtMs,
      totalNodes: incomingTotalNodes,
      totalMaps: incomingTotalMaps,
      activeMapId: payload.activeMapId || 'map_default',
      version: payload.version || 'FlowNotes-MultiMap-4.1.0',
      clientSource: payload.clientSource || 'web'
    };

    const payloadStr = JSON.stringify(payload);

    // 4. 持久化最新备份到 Cloudflare KV
    if (kv) {
      await kv.put('flownotes_latest_backup', payloadStr);
      await kv.put('flownotes_backup_meta', JSON.stringify(meta));
    }
    memoryBackupStore = { payload, meta };

    // 5. 更新不朽历史峰值备份库 (flownotes_peak_backup)
    let peakMeta = kv
      ? safeJsonParse(await kv.get('flownotes_peak_meta'))
      : (memoryPeakStore ? memoryPeakStore.meta : null);
    const prevPeakNodes = peakMeta ? (peakMeta.totalNodes || 0) : 0;

    if (incomingTotalNodes >= prevPeakNodes && incomingTotalNodes > 0) {
      const nextPeakMeta = { ...meta, key: 'flownotes_peak_backup' };
      if (kv) {
        await kv.put('flownotes_peak_backup', payloadStr);
        await kv.put('flownotes_peak_meta', JSON.stringify(nextPeakMeta));
      }
      memoryPeakStore = { payloadStr, meta: nextPeakMeta };
      peakMeta = nextPeakMeta;
    }

    return new Response(JSON.stringify({
      success: true,
      meta: {
        ...meta,
        peakNodes: peakMeta ? (peakMeta.totalNodes || incomingTotalNodes) : incomingTotalNodes,
        peakUpdatedAtMs: peakMeta ? (peakMeta.updatedAtMs || updatedAtMs) : updatedAtMs
      }
    }), {
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
    const historyOnly = url.searchParams.get('history') === '1';
    const snapshotKey = url.searchParams.get('snapshot');

    const kv = env && env.FLOWNOTES_CLIPBOARD ? env.FLOWNOTES_CLIPBOARD : null;

    // 1. 按 Key 精确拉取特定历史快照或峰值备份
    if (snapshotKey) {
      const isAllowedKey =
        snapshotKey.startsWith('flownotes_snap_') ||
        snapshotKey === 'flownotes_peak_backup' ||
        snapshotKey === 'flownotes_latest_backup';

      if (!isAllowedKey) {
        return new Response(JSON.stringify({ error: 'Invalid snapshot key' }), {
          status: 400,
          headers: CORS_HEADERS
        });
      }

      let snapVal = null;
      if (kv) {
        snapVal = await kv.get(snapshotKey);
      } else {
        if (snapshotKey === 'flownotes_peak_backup' && memoryPeakStore) {
          snapVal = memoryPeakStore.payloadStr;
        } else if (snapshotKey === 'flownotes_latest_backup' && memoryBackupStore) {
          snapVal = JSON.stringify(memoryBackupStore.payload);
        } else if (memorySnapshots.has(snapshotKey)) {
          snapVal = memorySnapshots.get(snapshotKey);
        }
      }

      if (!snapVal) {
        return new Response(JSON.stringify({ error: 'Snapshot not found' }), {
          status: 404,
          headers: CORS_HEADERS
        });
      }
      return new Response(snapVal, { status: 200, headers: CORS_HEADERS });
    }

    // 2. 拉取时光机版本库目录 (?history=1)
    if (historyOnly) {
      const peakMeta = kv
        ? safeJsonParse(await kv.get('flownotes_peak_meta'))
        : (memoryPeakStore ? memoryPeakStore.meta : null);
      let historyList = kv
        ? (safeJsonParse(await kv.get('flownotes_history_index'), []) || [])
        : [...memoryHistoryIndex];
      if (!Array.isArray(historyList)) historyList = [];

      return new Response(JSON.stringify({
        peak: peakMeta || null,
        history: historyList
      }), { status: 200, headers: CORS_HEADERS });
    }

    // 3. 读取元数据或完整最新备份
    const peakMeta = kv
      ? safeJsonParse(await kv.get('flownotes_peak_meta'))
      : (memoryPeakStore ? memoryPeakStore.meta : null);

    if (kv) {
      if (metaOnly) {
        const metaVal = safeJsonParse(await kv.get('flownotes_backup_meta'));
        if (metaVal) {
          return new Response(JSON.stringify({
            ...metaVal,
            peakNodes: peakMeta?.totalNodes || metaVal.totalNodes || 0,
            peakUpdatedAtMs: peakMeta?.updatedAtMs || metaVal.updatedAtMs || 0
          }), { status: 200, headers: CORS_HEADERS });
        }
      }

      const backupVal = await kv.get('flownotes_latest_backup');
      if (backupVal) {
        if (metaOnly) {
          const parsed = safeJsonParse(backupVal);
          if (parsed) {
            const stats = computePayloadStats(parsed);
            return new Response(JSON.stringify({
              exists: true,
              updatedAtMs: parsed.updatedAtMs || 0,
              totalNodes: stats.totalNodes,
              totalMaps: stats.totalMaps,
              peakNodes: peakMeta?.totalNodes || stats.totalNodes,
              peakUpdatedAtMs: peakMeta?.updatedAtMs || parsed.updatedAtMs || 0
            }), { status: 200, headers: CORS_HEADERS });
          }
        }
        return new Response(backupVal, { status: 200, headers: CORS_HEADERS });
      }
    }

    if (memoryBackupStore) {
      if (metaOnly) {
        return new Response(JSON.stringify({
          ...memoryBackupStore.meta,
          peakNodes: peakMeta?.totalNodes || memoryBackupStore.meta.totalNodes || 0,
          peakUpdatedAtMs: peakMeta?.updatedAtMs || memoryBackupStore.meta.updatedAtMs || 0
        }), { status: 200, headers: CORS_HEADERS });
      }
      return new Response(JSON.stringify(memoryBackupStore.payload), { status: 200, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({
      exists: false,
      totalNodes: 0,
      totalMaps: 0,
      peakNodes: peakMeta?.totalNodes || 0,
      peakUpdatedAtMs: peakMeta?.updatedAtMs || 0
    }), {
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
