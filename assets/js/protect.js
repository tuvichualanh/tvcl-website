// TVCL — password gate for protected pages.
// Content is AES-256-GCM encrypted at build time (see build.py: encrypt_for_gate).
// This script derives the same key in-browser via PBKDF2 + Web Crypto and decrypts.
(function () {
  var PBKDF2_ITERATIONS = 200000;

  function b64ToBuf(b64) {
    var bin = atob(b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  async function deriveKey(password, saltBuf, iterations) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBuf, iterations: iterations, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function tryUnlock(password) {
    var payloadEl = document.getElementById("protected-payload");
    if (!payloadEl) return false;
    var payload = JSON.parse(payloadEl.textContent);
    var salt = b64ToBuf(payload.salt);
    var iv = b64ToBuf(payload.iv);
    var ct = b64ToBuf(payload.ct);
    try {
      var key = await deriveKey(password, salt, payload.iter || PBKDF2_ITERATIONS);
      var plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
      var htmlStr = new TextDecoder().decode(plainBuf);
      var contentEl = document.getElementById("protected-content");
      contentEl.innerHTML = htmlStr;
      contentEl.style.display = "";
      document.getElementById("lock-gate").style.display = "none";
      try { sessionStorage.setItem("tvcl_pw", password); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var gate = document.getElementById("lock-gate");
    if (!gate) return;
    var form = document.getElementById("lock-form");
    var input = document.getElementById("lock-password");
    var errorEl = document.getElementById("lock-error");

    var remembered = null;
    try { remembered = sessionStorage.getItem("tvcl_pw"); } catch (e) {}
    if (remembered) {
      tryUnlock(remembered).then(function (ok) {
        if (!ok) { try { sessionStorage.removeItem("tvcl_pw"); } catch (e) {} }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.style.display = "none";
      tryUnlock(input.value).then(function (ok) {
        if (!ok) {
          errorEl.style.display = "";
          input.value = "";
          input.focus();
        }
      });
    });
  });
})();
