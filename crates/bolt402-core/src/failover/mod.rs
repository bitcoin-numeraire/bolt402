//! Multi-backend failover adapter.
//!
//! [`FailoverBackend`] wraps multiple [`LnBackend`] implementations and tries
//! them in order. If the primary backend fails with a failover-eligible error,
//! the next backend is tried automatically.
//!
//! # Circuit Breaker
//!
//! Each backend has a health state tracked by a circuit breaker. After
//! [`FailoverConfig::failure_threshold`] consecutive failures, a backend is
//! marked unhealthy and skipped until [`FailoverConfig::recovery_timeout`]
//! elapses, at which point it enters a half-open state and is retried once.
//!
//! # Example
//!
//! ```rust,no_run
//! use bolt402_core::failover::{FailoverBackend, FailoverConfig};
//! # use bolt402_core::port::{LnBackend, PaymentResult, NodeInfo};
//! # use bolt402_core::ClientError;
//! # use async_trait::async_trait;
//! # struct MyLnd; struct MyCln;
//! # #[async_trait] impl LnBackend for MyLnd {
//! #     async fn pay_invoice(&self, _: &str, _: u64) -> Result<PaymentResult, ClientError> { todo!() }
//! #     async fn get_balance(&self) -> Result<u64, ClientError> { todo!() }
//! #     async fn get_info(&self) -> Result<NodeInfo, ClientError> { todo!() }
//! # }
//! # #[async_trait] impl LnBackend for MyCln {
//! #     async fn pay_invoice(&self, _: &str, _: u64) -> Result<PaymentResult, ClientError> { todo!() }
//! #     async fn get_balance(&self) -> Result<u64, ClientError> { todo!() }
//! #     async fn get_info(&self) -> Result<NodeInfo, ClientError> { todo!() }
//! # }
//!
//! let failover = FailoverBackend::builder()
//!     .add_backend(MyLnd)
//!     .add_backend(MyCln)
//!     .config(FailoverConfig::default())
//!     .build()
//!     .unwrap();
//!
//! // Use `failover` as a normal LnBackend — it tries MyLnd first,
//! // then falls back to MyCln on infrastructure errors.
//! ```

mod health;

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::sync::RwLock;

use crate::error::ClientError;
use crate::port::{LnBackend, NodeInfo, PaymentResult};

pub use health::{BackendHealth, HealthState};

/// Configuration for [`FailoverBackend`] behavior.
#[derive(Debug, Clone)]
pub struct FailoverConfig {
    /// Number of consecutive failures before marking a backend unhealthy.
    ///
    /// Default: 3
    pub failure_threshold: u32,

    /// Duration to wait before retrying an unhealthy backend (half-open).
    ///
    /// Default: 5 minutes
    pub recovery_timeout: Duration,
}

impl Default for FailoverConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 3,
            recovery_timeout: Duration::from_secs(300),
        }
    }
}

/// A Lightning backend that tries multiple backends in order.
///
/// Implements the [`LnBackend`] trait by delegating to a chain of backends.
/// On failover-eligible errors (see [`ClientError::is_failover_eligible`]),
/// the next backend in the chain is tried. Non-failover errors (budget
/// exceeded, protocol errors) propagate immediately.
///
/// Each backend has an associated circuit breaker that tracks health state.
/// Unhealthy backends are skipped until the recovery timeout elapses.
pub struct FailoverBackend {
    backends: Vec<BackendEntry>,
    config: FailoverConfig,
}

/// A backend paired with its health tracker.
type BackendEntry = (Arc<dyn LnBackend>, Arc<RwLock<BackendHealth>>);

impl FailoverBackend {
    /// Create a new [`FailoverBuilder`].
    pub fn builder() -> FailoverBuilder {
        FailoverBuilder::new()
    }

    /// Get the number of backends in the failover chain.
    pub fn backend_count(&self) -> usize {
        self.backends.len()
    }

    /// Get the health states of all backends.
    pub async fn health_states(&self) -> Vec<HealthState> {
        let mut states = Vec::with_capacity(self.backends.len());
        for (_, health) in &self.backends {
            states.push(health.read().await.state());
        }
        states
    }

    /// Try an operation across all backends with failover.
    async fn try_backends<F, Fut, T>(&self, operation: F) -> Result<T, ClientError>
    where
        F: Fn(Arc<dyn LnBackend>) -> Fut,
        Fut: Future<Output = Result<T, ClientError>>,
    {
        let mut last_error: Option<ClientError> = None;
        let mut tried = 0u32;

        for (backend, health_lock) in &self.backends {
            // Check health state
            let should_try = {
                let mut health = health_lock.write().await;
                health.should_try(self.config.recovery_timeout)
            };

            if !should_try {
                tracing::debug!(backend_index = tried, "skipping unhealthy backend");
                tried += 1;
                continue;
            }

            match operation(Arc::clone(backend)).await {
                Ok(result) => {
                    // Record success
                    let mut health = health_lock.write().await;
                    health.record_success();
                    return Ok(result);
                }
                Err(e) => {
                    if e.is_failover_eligible() {
                        tracing::warn!(
                            backend_index = tried,
                            error = %e,
                            "backend failed, attempting failover"
                        );

                        // Record failure
                        let mut health = health_lock.write().await;
                        health.record_failure(self.config.failure_threshold);

                        last_error = Some(e);
                        tried += 1;
                        continue;
                    }

                    // Non-failover error: propagate immediately
                    return Err(e);
                }
            }
        }

        Err(last_error.unwrap_or(ClientError::AllBackendsFailed {
            reason: "no backends available (all unhealthy)".to_string(),
        }))
    }
}

#[async_trait]
impl LnBackend for FailoverBackend {
    async fn pay_invoice(
        &self,
        bolt11: &str,
        max_fee_sats: u64,
    ) -> Result<PaymentResult, ClientError> {
        let bolt11 = bolt11.to_string();
        self.try_backends(move |backend| {
            let bolt11 = bolt11.clone();
            async move { backend.pay_invoice(&bolt11, max_fee_sats).await }
        })
        .await
    }

    async fn get_balance(&self) -> Result<u64, ClientError> {
        self.try_backends(|backend| async move { backend.get_balance().await })
            .await
    }

    async fn get_info(&self) -> Result<NodeInfo, ClientError> {
        self.try_backends(|backend| async move { backend.get_info().await })
            .await
    }
}

/// Builder for [`FailoverBackend`].
pub struct FailoverBuilder {
    backends: Vec<Arc<dyn LnBackend>>,
    config: FailoverConfig,
}

impl FailoverBuilder {
    /// Create a new builder.
    fn new() -> Self {
        Self {
            backends: Vec::new(),
            config: FailoverConfig::default(),
        }
    }

    /// Add a backend to the failover chain.
    ///
    /// Backends are tried in the order they are added. The first backend
    /// added is the primary.
    #[must_use]
    pub fn add_backend<B: LnBackend + 'static>(mut self, backend: B) -> Self {
        self.backends.push(Arc::new(backend));
        self
    }

    /// Set the failover configuration.
    #[must_use]
    pub fn config(mut self, config: FailoverConfig) -> Self {
        self.config = config;
        self
    }

    /// Build the [`FailoverBackend`].
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::Backend`] if no backends were added.
    pub fn build(self) -> Result<FailoverBackend, ClientError> {
        if self.backends.is_empty() {
            return Err(ClientError::Backend {
                reason: "FailoverBackend requires at least one backend".to_string(),
            });
        }

        let backends = self
            .backends
            .into_iter()
            .map(|b| (b, Arc::new(RwLock::new(BackendHealth::new()))))
            .collect();

        Ok(FailoverBackend {
            backends,
            config: self.config,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::port::NodeInfo;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Duration;

    /// A test backend that fails a configurable number of times, then succeeds.
    struct TestBackend {
        name: String,
        fail_count: AtomicU32,
        fail_limit: u32,
        call_count: AtomicU32,
        error_kind: FailKind,
    }

    enum FailKind {
        Backend,
        BudgetExceeded,
    }

    impl TestBackend {
        fn always_succeeds(name: &str) -> Self {
            Self {
                name: name.to_string(),
                fail_count: AtomicU32::new(0),
                fail_limit: 0,
                call_count: AtomicU32::new(0),
                error_kind: FailKind::Backend,
            }
        }

        fn always_fails(name: &str) -> Self {
            Self {
                name: name.to_string(),
                fail_count: AtomicU32::new(0),
                fail_limit: u32::MAX,
                call_count: AtomicU32::new(0),
                error_kind: FailKind::Backend,
            }
        }

        fn fails_then_succeeds(name: &str, fail_limit: u32) -> Self {
            Self {
                name: name.to_string(),
                fail_count: AtomicU32::new(0),
                fail_limit,
                call_count: AtomicU32::new(0),
                error_kind: FailKind::Backend,
            }
        }

        fn always_fails_non_failover(name: &str) -> Self {
            Self {
                name: name.to_string(),
                fail_count: AtomicU32::new(0),
                fail_limit: u32::MAX,
                call_count: AtomicU32::new(0),
                error_kind: FailKind::BudgetExceeded,
            }
        }

        fn calls(&self) -> u32 {
            self.call_count.load(Ordering::Relaxed)
        }
    }

    #[async_trait]
    impl LnBackend for TestBackend {
        async fn pay_invoice(
            &self,
            _bolt11: &str,
            _max_fee_sats: u64,
        ) -> Result<PaymentResult, ClientError> {
            self.call_count.fetch_add(1, Ordering::Relaxed);
            let count = self.fail_count.fetch_add(1, Ordering::Relaxed);

            if count < self.fail_limit {
                return Err(match self.error_kind {
                    FailKind::Backend => ClientError::Backend {
                        reason: format!("{} connection refused", self.name),
                    },
                    FailKind::BudgetExceeded => ClientError::BudgetExceeded {
                        reason: "per-request limit exceeded".to_string(),
                    },
                });
            }

            Ok(PaymentResult {
                preimage: format!("{}_preimage", self.name),
                payment_hash: format!("{}_hash", self.name),
                amount_sats: 100,
                fee_sats: 1,
            })
        }

        async fn get_balance(&self) -> Result<u64, ClientError> {
            self.call_count.fetch_add(1, Ordering::Relaxed);
            let count = self.fail_count.fetch_add(1, Ordering::Relaxed);

            if count < self.fail_limit {
                return Err(ClientError::Backend {
                    reason: format!("{} unavailable", self.name),
                });
            }

            Ok(500_000)
        }

        async fn get_info(&self) -> Result<NodeInfo, ClientError> {
            self.call_count.fetch_add(1, Ordering::Relaxed);

            Ok(NodeInfo {
                pubkey: format!("{}_pubkey", self.name),
                alias: self.name.clone(),
                num_active_channels: 5,
            })
        }
    }

    #[test]
    fn builder_requires_at_least_one_backend() {
        let result = FailoverBackend::builder().build();
        assert!(result.is_err());
    }

    #[test]
    fn builder_single_backend() {
        let result = FailoverBackend::builder()
            .add_backend(TestBackend::always_succeeds("lnd"))
            .build();
        assert!(result.is_ok());
        assert_eq!(result.unwrap().backend_count(), 1);
    }

    #[test]
    fn builder_multiple_backends() {
        let result = FailoverBackend::builder()
            .add_backend(TestBackend::always_succeeds("lnd"))
            .add_backend(TestBackend::always_succeeds("cln"))
            .add_backend(TestBackend::always_succeeds("nwc"))
            .build();
        assert!(result.is_ok());
        assert_eq!(result.unwrap().backend_count(), 3);
    }

    #[tokio::test]
    async fn primary_succeeds_no_failover() {
        let primary = TestBackend::always_succeeds("lnd");
        let secondary = TestBackend::always_succeeds("cln");

        let failover = FailoverBackend::builder()
            .add_backend(primary)
            .add_backend(secondary)
            .build()
            .unwrap();

        let result = failover.pay_invoice("lnbc...", 100).await.unwrap();
        assert_eq!(result.preimage, "lnd_preimage");

        // Only primary should have been called
        assert_eq!(
            failover.backends[0].1.read().await.state(),
            HealthState::Healthy
        );
    }

    #[tokio::test]
    async fn primary_fails_secondary_succeeds() {
        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_fails("lnd"))
            .add_backend(TestBackend::always_succeeds("cln"))
            .build()
            .unwrap();

        let result = failover.pay_invoice("lnbc...", 100).await.unwrap();
        assert_eq!(result.preimage, "cln_preimage");
    }

    #[tokio::test]
    async fn all_backends_fail() {
        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_fails("lnd"))
            .add_backend(TestBackend::always_fails("cln"))
            .build()
            .unwrap();

        let result = failover.pay_invoice("lnbc...", 100).await;
        assert!(result.is_err());

        // Should be a Backend error (last error from the chain)
        let err = result.unwrap_err();
        assert!(
            matches!(err, ClientError::Backend { .. }),
            "expected Backend error, got: {err:?}"
        );
    }

    #[tokio::test]
    async fn non_failover_error_propagates_immediately() {
        let secondary = TestBackend::always_succeeds("cln");

        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_fails_non_failover("lnd"))
            .add_backend(secondary)
            .build()
            .unwrap();

        let result = failover.pay_invoice("lnbc...", 100).await;
        assert!(result.is_err());

        // Should be BudgetExceeded (non-failover), not falling through to cln
        let err = result.unwrap_err();
        assert!(
            matches!(err, ClientError::BudgetExceeded { .. }),
            "expected BudgetExceeded, got: {err:?}"
        );
    }

    #[tokio::test]
    async fn circuit_breaker_marks_unhealthy() {
        let config = FailoverConfig {
            failure_threshold: 2,
            recovery_timeout: Duration::from_secs(300),
        };

        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_fails("lnd"))
            .add_backend(TestBackend::always_succeeds("cln"))
            .config(config)
            .build()
            .unwrap();

        // First call: lnd fails (1/2), falls back to cln
        failover.pay_invoice("lnbc...", 100).await.unwrap();

        // Second call: lnd fails (2/2), now marked unhealthy, falls back to cln
        failover.pay_invoice("lnbc...", 100).await.unwrap();

        // Third call: lnd should be skipped (unhealthy), goes straight to cln
        failover.pay_invoice("lnbc...", 100).await.unwrap();

        let states = failover.health_states().await;
        assert_eq!(states[0], HealthState::Unhealthy);
        assert_eq!(states[1], HealthState::Healthy);
    }

    #[tokio::test]
    async fn failover_get_balance() {
        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_fails("lnd"))
            .add_backend(TestBackend::always_succeeds("cln"))
            .build()
            .unwrap();

        let balance = failover.get_balance().await.unwrap();
        assert_eq!(balance, 500_000);
    }

    #[tokio::test]
    async fn failover_get_info() {
        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_succeeds("lnd"))
            .build()
            .unwrap();

        let info = failover.get_info().await.unwrap();
        assert_eq!(info.alias, "lnd");
    }

    #[tokio::test]
    async fn health_states_all_healthy_initially() {
        let failover = FailoverBackend::builder()
            .add_backend(TestBackend::always_succeeds("lnd"))
            .add_backend(TestBackend::always_succeeds("cln"))
            .build()
            .unwrap();

        let states = failover.health_states().await;
        assert_eq!(states, vec![HealthState::Healthy, HealthState::Healthy]);
    }

    #[tokio::test]
    async fn default_config() {
        let config = FailoverConfig::default();
        assert_eq!(config.failure_threshold, 3);
        assert_eq!(config.recovery_timeout, Duration::from_secs(300));
    }
}
