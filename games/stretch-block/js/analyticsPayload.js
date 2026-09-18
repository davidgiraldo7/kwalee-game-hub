// Analytics payload mutation helper.
// Full JSON is sent only via update_payload when content changes;
// game_action receives the payload hash. See analytics.md.

(function (global) {
  "use strict";

  var STORAGE_KEY = "kpf_analytics_client_id";
  var lastJson = null;
  var lastHash = null;
  var clientId = null;

  function getClientId() {
    if (clientId) return clientId;
    try {
      clientId = localStorage.getItem(STORAGE_KEY) || "";
    } catch (e) {
      clientId = "";
    }
    if (!clientId) {
      clientId =
        "c_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 10);
      try {
        localStorage.setItem(STORAGE_KEY, clientId);
      } catch (e) {
        /* ignore quota / private mode */
      }
    }
    return clientId;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return "[" + value.map(stableStringify).join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      parts.push(JSON.stringify(key) + ":" + stableStringify(value[key]));
    }
    return "{" + parts.join(",") + "}";
  }

  function normalizePayload(payload) {
    if (payload == null || payload === "") {
      return "{}";
    }
    if (typeof payload === "string") {
      try {
        return stableStringify(JSON.parse(payload));
      } catch (e) {
        return stableStringify({ raw: payload });
      }
    }
    return stableStringify(payload);
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  /**
   * If payload JSON mutated since last send, invoke onUpdate (or global update_payload)
   * and refresh hash.
   * @param {string|object} payload
   * @param {function(string,string,string)=} onUpdate (hash, clientId, json)
   * @returns {string} payload hash for game_action
   */
  function syncPayload(payload, onUpdate) {
    var json = normalizePayload(payload);
    if (json === lastJson && lastHash) {
      return lastHash;
    }
    var hash = hashString(json);
    lastJson = json;
    lastHash = hash;
    var emit = typeof onUpdate === "function" ? onUpdate : global.update_payload;
    if (typeof emit === "function") {
      emit(hash, getClientId(), json);
    }
    return hash;
  }

  /**
   * Call-site entry when stubs are on global: sync then send_game_action(hash).
   * Prefer wiring from index.html when stubs are IIFE-local.
   * @param {string} context
   * @param {string|object} event_payload JSON string or plain object
   * @param {function(string,string,string)=} onUpdate
   * @param {function(string,string)=} onAction (context, hash)
   */
  function gameAction(context, event_payload, onUpdate, onAction) {
    var hash = syncPayload(event_payload, onUpdate);
    var send = typeof onAction === "function" ? onAction : global.send_game_action;
    if (typeof send === "function") {
      send(context, hash);
    }
  }

  function resetForTests() {
    lastJson = null;
    lastHash = null;
  }

  global.AnalyticsPayload = {
    getClientId: getClientId,
    normalizePayload: normalizePayload,
    syncPayload: syncPayload,
    gameAction: gameAction,
    getLastHash: function () {
      return lastHash;
    },
    getLastJson: function () {
      return lastJson;
    },
    resetForTests: resetForTests
  };
})(typeof window !== "undefined" ? window : globalThis);
