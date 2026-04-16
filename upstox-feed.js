/**
 * upstox-feed.js
 * Singleton EventEmitter that maintains a single Upstox market-data WebSocket
 * connection and emits 'tick' events to all listeners.
 */

import { EventEmitter } from "events";
import axios from "axios";
import WebSocket from "ws";
import protobuf from "protobufjs";

// ── Inline proto schema ────────────────────────────────────────────────────────
const PROTO_SCHEMA = `
syntax = "proto3";
package com.upstox.marketdatafeeder.rpc.proto;

enum Method  { sub = 0; unsub = 1; }
enum DataType { Full = 0; LTPC = 1; }

message FeedRequest {
  Method   method    = 1;
  repeated string keys = 2;
  DataType data_type = 3;
}

message LTPC {
  double ltp = 1;
  int64  ltt = 2;
  int64  ltq = 3;
  double cp  = 4;
}

message Depth {
  double price         = 1;
  int32  quantity      = 2;
  int32  num_of_orders = 3;
}

message MarketDepth {
  repeated Depth bid = 1;
  repeated Depth ask = 2;
}

message MarketFullFeed {
  LTPC        ltpc  = 1;
  double      atp   = 2;
  double      cp    = 3;
  double      vtt   = 4;
  double      oi    = 5;
  int64       tbq   = 6;
  int64       tsq   = 7;
  double      to    = 8;
  double      lc    = 9;
  double      uc    = 10;
  MarketDepth depth = 11;
  double      iv    = 12;
}

message IndexFullFeed {
  LTPC   ltpc   = 1;
  double cp     = 2;
  double lc     = 3;
  double uc     = 4;
  double to     = 5;
  double change = 6;
}

message FullFeed {
  MarketFullFeed marketFF = 10;
  IndexFullFeed  indexFF  = 11;
}

message Feed {
  FullFeed ff   = 11;
  LTPC     ltpc = 12;
}

message FeedResponse {
  string            type  = 1;
  map<string, Feed> feeds = 2;
}
`;

const LOG = (...args) => console.log("[FEED]", ...args);
const ERR = (...args) => console.error("[FEED]", ...args);

// Backoff constants
const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;

class UpstoxFeed extends EventEmitter {
  constructor() {
    super();
    this._token = null;
    this._ws = null;
    this._subscribedKeys = new Set();
    this._reconnectDelay = BACKOFF_INITIAL_MS;
    this._stopped = false;
    this._reconnectTimer = null;

    // Protobuf types — loaded lazily once
    this._FeedRequest = null;
    this._FeedResponse = null;
    this._protoReady = false;
    this._protoPromise = null;
  }

  // ── Proto loading ────────────────────────────────────────────────────────────
  async _loadProto() {
    if (this._protoReady) return;
    if (this._protoPromise) return this._protoPromise;

    this._protoPromise = (async () => {
      const root = protobuf.parse(PROTO_SCHEMA, { keepCase: true }).root;
      this._FeedRequest = root.lookupType(
        "com.upstox.marketdatafeeder.rpc.proto.FeedRequest"
      );
      this._FeedResponse = root.lookupType(
        "com.upstox.marketdatafeeder.rpc.proto.FeedResponse"
      );
      this._protoReady = true;
      LOG("Protobuf schema loaded");
    })();

    return this._protoPromise;
  }

  // ── Auth + connect ───────────────────────────────────────────────────────────
  async _getWsUrl() {
    const res = await axios.get(
      "https://api.upstox.com/v2/feed/market-data-feed/authorize",
      {
        headers: {
          Authorization: `Bearer ${this._token}`,
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );
    const url = res.data?.data?.authorizedRedirectUri;
    if (!url) throw new Error("No authorizedRedirectUri in authorize response");
    return url;
  }

  async _connect() {
    if (this._stopped) return;

    await this._loadProto();

    let wsUrl;
    try {
      wsUrl = await this._getWsUrl();
      LOG("Got WebSocket URL, connecting…");
    } catch (err) {
      ERR("Failed to get WebSocket URL:", err.message);
      this._scheduleReconnect();
      return;
    }

    const ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${this._token}` },
    });
    ws.binaryType = "nodebuffer";
    this._ws = ws;

    ws.on("open", () => {
      LOG("WebSocket connected");
      this._reconnectDelay = BACKOFF_INITIAL_MS; // reset on successful connect
      // Re-subscribe all current keys
      if (this._subscribedKeys.size > 0) {
        this._sendSubscribe([...this._subscribedKeys]);
      }
    });

    ws.on("message", (data) => {
      this._handleMessage(data);
    });

    ws.on("error", (err) => {
      ERR("WebSocket error:", err.message);
    });

    ws.on("close", (code, reason) => {
      LOG(`WebSocket closed (code=${code}, reason=${reason?.toString() || ""})`);
      this._ws = null;
      if (!this._stopped) {
        this._scheduleReconnect();
      }
    });
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    const delay = this._reconnectDelay;
    LOG(`Reconnecting in ${delay}ms…`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
    // Exponential backoff, capped at max
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, BACKOFF_MAX_MS);
  }

  // ── Protobuf encode/decode ───────────────────────────────────────────────────
  _sendSubscribe(keys) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    if (!this._FeedRequest) {
      ERR("Proto not ready — cannot send subscribe");
      return;
    }

    const payload = { method: 0 /* sub */, keys, data_type: 0 /* Full */ };
    const errMsg = this._FeedRequest.verify(payload);
    if (errMsg) {
      ERR("FeedRequest verify error:", errMsg);
      return;
    }
    const buf = this._FeedRequest.encode(
      this._FeedRequest.create(payload)
    ).finish();
    this._ws.send(buf, (err) => {
      if (err) ERR("Send error:", err.message);
      else LOG(`Subscribed ${keys.length} key(s)`);
    });
  }

  _handleMessage(data) {
    if (!this._FeedResponse) return;
    try {
      const response = this._FeedResponse.decode(data);
      const feeds = response.feeds;
      if (!feeds) return;

      for (const [instrument_key, feed] of Object.entries(feeds)) {
        let ltp = 0, ltt = 0, ltq = 0, cp = 0, atp = 0, oi = 0, volume = 0;

        const ff = feed.ff;
        if (ff) {
          const mff = ff.marketFF;
          const iff = ff.indexFF;

          if (mff) {
            const ltpc = mff.ltpc;
            if (ltpc) {
              ltp = ltpc.ltp ?? 0;
              ltt = Number(ltpc.ltt ?? 0);
              ltq = Number(ltpc.ltq ?? 0);
              cp = ltpc.cp ?? 0;
            }
            atp = mff.atp ?? 0;
            oi = mff.oi ?? 0;
            volume = Number(mff.vtt ?? 0);
          } else if (iff) {
            const ltpc = iff.ltpc;
            if (ltpc) {
              ltp = ltpc.ltp ?? 0;
              ltt = Number(ltpc.ltt ?? 0);
              ltq = Number(ltpc.ltq ?? 0);
              cp = ltpc.cp ?? 0;
            }
          }
        } else if (feed.ltpc) {
          // LTPC-only feed
          ltp = feed.ltpc.ltp ?? 0;
          ltt = Number(feed.ltpc.ltt ?? 0);
          ltq = Number(feed.ltpc.ltq ?? 0);
          cp = feed.ltpc.cp ?? 0;
        }

        this.emit("tick", { instrument_key, ltp, ltt, ltq, oi, volume, cp, atp });
      }
    } catch (err) {
      ERR("Failed to decode FeedResponse:", err.message);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * subscribe(keys: string[])
   * Adds new keys to the subscription set and sends only the diff to Upstox.
   */
  subscribe(keys) {
    const newKeys = keys.filter((k) => !this._subscribedKeys.has(k));
    if (newKeys.length === 0) return;
    newKeys.forEach((k) => this._subscribedKeys.add(k));
    LOG(`Adding ${newKeys.length} new key(s) to subscription`);
    this._sendSubscribe(newKeys);
  }

  /**
   * unsubscribe(keys: string[])
   * Removes keys from the tracked set. Does not send an unsub message to
   * Upstox (ticks for those keys will simply be ignored by clients).
   */
  unsubscribe(keys) {
    keys.forEach((k) => this._subscribedKeys.delete(k));
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
export const upstoxFeed = new UpstoxFeed();

/**
 * startFeed(token)
 * Initialise the feed with an access token and open the Upstox WebSocket.
 */
export async function startFeed(token) {
  if (!token) {
    ERR("startFeed called without a token — aborting");
    return;
  }
  upstoxFeed._token = token;
  upstoxFeed._stopped = false;
  LOG("Starting Upstox market-data feed…");
  await upstoxFeed._connect();
}

/**
 * stopFeed()
 * Gracefully close the WebSocket and stop reconnect attempts.
 */
export function stopFeed() {
  LOG("Stopping feed");
  upstoxFeed._stopped = true;
  if (upstoxFeed._reconnectTimer) {
    clearTimeout(upstoxFeed._reconnectTimer);
    upstoxFeed._reconnectTimer = null;
  }
  if (upstoxFeed._ws) {
    upstoxFeed._ws.close();
    upstoxFeed._ws = null;
  }
}
