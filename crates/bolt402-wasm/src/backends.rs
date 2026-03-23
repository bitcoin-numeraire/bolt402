//! WASM-bindgen wrappers for the real Lightning backends.
//!
//! Exposes `LndRestBackend` and `SwissKnifeBackend` from Rust to JavaScript
//! via wasm-bindgen, so that `bolt402-ai-sdk` can use the Rust implementations
//! directly instead of maintaining separate TypeScript clients.

use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

use bolt402_lnd::LndRestBackend;
use bolt402_proto::LnBackend;
use bolt402_swissknife::SwissKnifeBackend as RustSwissKnifeBackend;

// ---------------------------------------------------------------------------
// WasmLndRestBackend
// ---------------------------------------------------------------------------

/// LND REST backend for use in JavaScript/TypeScript.
///
/// Wraps the Rust `LndRestBackend` which uses `reqwest` (compiled to
/// browser `fetch` on WASM). This is the single implementation of the
/// LND REST client, shared across TS, Python, and Go via their
/// respective bindings.
///
/// # Example
///
/// ```javascript
/// import init, { WasmLndRestBackend } from 'bolt402-wasm';
///
/// await init();
///
/// const lnd = new WasmLndRestBackend("https://localhost:8080", "deadbeef...");
/// const info = await lnd.getInfo();
/// console.log(info.alias);
///
/// const result = await lnd.payInvoice("lnbc...", 100n);
/// console.log(result.preimage);
/// ```
#[wasm_bindgen]
pub struct WasmLndRestBackend {
    inner: LndRestBackend,
}

#[wasm_bindgen]
impl WasmLndRestBackend {
    /// Create a new LND REST backend.
    ///
    /// # Arguments
    ///
    /// * `url` - LND REST API URL (e.g. `https://localhost:8080`)
    /// * `macaroon` - Hex-encoded admin macaroon
    #[wasm_bindgen(constructor)]
    pub fn new(url: &str, macaroon: &str) -> Result<WasmLndRestBackend, JsError> {
        let inner = LndRestBackend::new(url, macaroon)
            .map_err(|e| JsError::new(&format!("failed to create LND backend: {e}")))?;
        Ok(Self { inner })
    }

    /// Create a new LND REST backend with a custom reqwest client.
    ///
    /// Useful for custom TLS settings or proxies.
    #[wasm_bindgen(js_name = "withClient")]
    pub fn with_client(
        url: &str,
        macaroon: &str,
        // In WASM, we can't pass a reqwest::Client from JS,
        // so this creates a default client.
    ) -> Result<WasmLndRestBackend, JsError> {
        Self::new(url, macaroon)
    }

    /// Pay a BOLT11 Lightning invoice.
    ///
    /// Returns a promise that resolves to `{ preimage, paymentHash, amountSats, feeSats }`.
    #[wasm_bindgen(js_name = "payInvoice")]
    pub fn pay_invoice(&self, bolt11: &str, max_fee_sats: u64) -> js_sys::Promise {
        let bolt11 = bolt11.to_string();
        let inner = self.inner.clone();

        future_to_promise(async move {
            let result = inner
                .pay_invoice(&bolt11, max_fee_sats)
                .await
                .map_err(|e| JsValue::from_str(&format!("{e}")))?;

            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &"preimage".into(), &result.preimage.into())?;
            js_sys::Reflect::set(&obj, &"paymentHash".into(), &result.payment_hash.into())?;
            js_sys::Reflect::set(
                &obj,
                &"amountSats".into(),
                &JsValue::from_f64(result.amount_sats as f64),
            )?;
            js_sys::Reflect::set(
                &obj,
                &"feeSats".into(),
                &JsValue::from_f64(result.fee_sats as f64),
            )?;
            Ok(obj.into())
        })
    }

    /// Get the current spendable balance in satoshis.
    #[wasm_bindgen(js_name = "getBalance")]
    pub fn get_balance(&self) -> js_sys::Promise {
        let inner = self.inner.clone();

        future_to_promise(async move {
            let balance = inner
                .get_balance()
                .await
                .map_err(|e| JsValue::from_str(&format!("{e}")))?;
            Ok(JsValue::from_f64(balance as f64))
        })
    }

    /// Get information about the connected Lightning node.
    ///
    /// Returns `{ pubkey, alias, numActiveChannels }`.
    #[wasm_bindgen(js_name = "getInfo")]
    pub fn get_info(&self) -> js_sys::Promise {
        let inner = self.inner.clone();

        future_to_promise(async move {
            let info = inner
                .get_info()
                .await
                .map_err(|e| JsValue::from_str(&format!("{e}")))?;

            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &"pubkey".into(), &info.pubkey.into())?;
            js_sys::Reflect::set(&obj, &"alias".into(), &info.alias.into())?;
            js_sys::Reflect::set(
                &obj,
                &"numActiveChannels".into(),
                &JsValue::from_f64(f64::from(info.num_active_channels)),
            )?;
            Ok(obj.into())
        })
    }
}

// ---------------------------------------------------------------------------
// WasmSwissKnifeBackend
// ---------------------------------------------------------------------------

/// SwissKnife REST backend for use in JavaScript/TypeScript.
///
/// Wraps the Rust `SwissKnifeBackend` which uses `reqwest`.
///
/// # Example
///
/// ```javascript
/// import init, { WasmSwissKnifeBackend } from 'bolt402-wasm';
///
/// await init();
///
/// const sk = new WasmSwissKnifeBackend("https://app.numeraire.tech", "sk-...");
/// const info = await sk.getInfo();
/// ```
#[wasm_bindgen]
pub struct WasmSwissKnifeBackend {
    inner: RustSwissKnifeBackend,
}

#[wasm_bindgen]
impl WasmSwissKnifeBackend {
    /// Create a new SwissKnife backend.
    ///
    /// # Arguments
    ///
    /// * `url` - SwissKnife API URL (e.g. `https://app.numeraire.tech`)
    /// * `api_key` - API key for authentication
    #[wasm_bindgen(constructor)]
    pub fn new(url: &str, api_key: &str) -> Self {
        Self {
            inner: RustSwissKnifeBackend::new(url, api_key),
        }
    }

    /// Pay a BOLT11 Lightning invoice.
    #[wasm_bindgen(js_name = "payInvoice")]
    pub fn pay_invoice(&self, bolt11: &str, max_fee_sats: u64) -> js_sys::Promise {
        let bolt11 = bolt11.to_string();
        let inner = self.inner.clone();

        future_to_promise(async move {
            let result = inner
                .pay_invoice(&bolt11, max_fee_sats)
                .await
                .map_err(|e| JsValue::from_str(&format!("{e}")))?;

            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &"preimage".into(), &result.preimage.into())?;
            js_sys::Reflect::set(&obj, &"paymentHash".into(), &result.payment_hash.into())?;
            js_sys::Reflect::set(
                &obj,
                &"amountSats".into(),
                &JsValue::from_f64(result.amount_sats as f64),
            )?;
            js_sys::Reflect::set(
                &obj,
                &"feeSats".into(),
                &JsValue::from_f64(result.fee_sats as f64),
            )?;
            Ok(obj.into())
        })
    }

    /// Get the current spendable balance in satoshis.
    #[wasm_bindgen(js_name = "getBalance")]
    pub fn get_balance(&self) -> js_sys::Promise {
        let inner = self.inner.clone();

        future_to_promise(async move {
            let balance = inner
                .get_balance()
                .await
                .map_err(|e| JsValue::from_str(&format!("{e}")))?;
            Ok(JsValue::from_f64(balance as f64))
        })
    }

    /// Get information about the connected Lightning node.
    #[wasm_bindgen(js_name = "getInfo")]
    pub fn get_info(&self) -> js_sys::Promise {
        let inner = self.inner.clone();

        future_to_promise(async move {
            let info = inner
                .get_info()
                .await
                .map_err(|e| JsValue::from_str(&format!("{e}")))?;

            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &"pubkey".into(), &info.pubkey.into())?;
            js_sys::Reflect::set(&obj, &"alias".into(), &info.alias.into())?;
            js_sys::Reflect::set(
                &obj,
                &"numActiveChannels".into(),
                &JsValue::from_f64(f64::from(info.num_active_channels)),
            )?;
            Ok(obj.into())
        })
    }
}
