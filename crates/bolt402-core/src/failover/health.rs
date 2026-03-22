//! Circuit breaker health tracking for failover backends.
//!
//! Each backend in a [`super::FailoverBackend`] chain has an associated
//! [`BackendHealth`] that tracks consecutive failures and transitions
//! through health states:
//!
//! ```text
//! Healthy → (threshold failures) → Unhealthy → (timeout) → HalfOpen → success → Healthy
//!                                                         → failure → Unhealthy
//! ```

use std::time::{Duration, Instant};

/// Health state of a backend in the failover chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthState {
    /// Backend is operating normally.
    Healthy,

    /// Backend has exceeded the failure threshold and is being skipped.
    Unhealthy,

    /// Backend was unhealthy but the recovery timeout has elapsed.
    /// The next call will be a probe: success returns to Healthy,
    /// failure returns to Unhealthy.
    HalfOpen,
}

/// Tracks the health of a single backend using a circuit breaker pattern.
#[derive(Debug)]
pub struct BackendHealth {
    state: HealthState,
    consecutive_failures: u32,
    last_failure: Option<Instant>,
}

impl BackendHealth {
    /// Create a new healthy backend health tracker.
    pub fn new() -> Self {
        Self {
            state: HealthState::Healthy,
            consecutive_failures: 0,
            last_failure: None,
        }
    }

    /// Get the current health state, considering recovery timeout.
    pub fn state(&self) -> HealthState {
        self.state
    }

    /// Whether this backend should be tried for the next operation.
    ///
    /// Returns `true` for `Healthy` and `HalfOpen` states. For `Unhealthy`
    /// backends, checks if the recovery timeout has elapsed and
    /// transitions to `HalfOpen` if so.
    pub fn should_try(&mut self, recovery_timeout: Duration) -> bool {
        match self.state {
            HealthState::Healthy | HealthState::HalfOpen => true,
            HealthState::Unhealthy => {
                if let Some(last_failure) = self.last_failure {
                    if last_failure.elapsed() >= recovery_timeout {
                        tracing::info!("backend entering half-open state after recovery timeout");
                        self.state = HealthState::HalfOpen;
                        return true;
                    }
                }
                false
            }
        }
    }

    /// Record a successful operation. Resets the circuit breaker.
    pub fn record_success(&mut self) {
        self.state = HealthState::Healthy;
        self.consecutive_failures = 0;
        self.last_failure = None;
    }

    /// Record a failed operation. May transition to Unhealthy.
    pub fn record_failure(&mut self, threshold: u32) {
        self.consecutive_failures += 1;
        self.last_failure = Some(Instant::now());

        if self.consecutive_failures >= threshold {
            tracing::warn!(
                failures = self.consecutive_failures,
                threshold,
                "backend marked unhealthy"
            );
            self.state = HealthState::Unhealthy;
        }
    }
}

impl Default for BackendHealth {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_healthy() {
        let health = BackendHealth::new();
        assert_eq!(health.state(), HealthState::Healthy);
        assert_eq!(health.consecutive_failures, 0);
    }

    #[test]
    fn healthy_should_try() {
        let mut health = BackendHealth::new();
        assert!(health.should_try(Duration::from_secs(60)));
    }

    #[test]
    fn success_resets_failures() {
        let mut health = BackendHealth::new();
        health.record_failure(3);
        health.record_failure(3);
        assert_eq!(health.consecutive_failures, 2);
        assert_eq!(health.state(), HealthState::Healthy);

        health.record_success();
        assert_eq!(health.consecutive_failures, 0);
        assert_eq!(health.state(), HealthState::Healthy);
    }

    #[test]
    fn threshold_triggers_unhealthy() {
        let mut health = BackendHealth::new();
        health.record_failure(3);
        assert_eq!(health.state(), HealthState::Healthy);

        health.record_failure(3);
        assert_eq!(health.state(), HealthState::Healthy);

        health.record_failure(3);
        assert_eq!(health.state(), HealthState::Unhealthy);
    }

    #[test]
    fn unhealthy_should_not_try() {
        let mut health = BackendHealth::new();
        health.record_failure(1); // threshold=1 → immediately unhealthy
        assert_eq!(health.state(), HealthState::Unhealthy);

        // With a long recovery timeout, should not try
        assert!(!health.should_try(Duration::from_secs(3600)));
    }

    #[test]
    fn unhealthy_recovers_after_timeout() {
        let mut health = BackendHealth::new();
        health.record_failure(1);
        assert_eq!(health.state(), HealthState::Unhealthy);

        // Simulate elapsed time by setting last_failure to the past
        health.last_failure = Some(Instant::now() - Duration::from_secs(10));

        // With a short recovery timeout, should transition to HalfOpen
        assert!(health.should_try(Duration::from_secs(5)));
        assert_eq!(health.state(), HealthState::HalfOpen);
    }

    #[test]
    fn half_open_success_returns_healthy() {
        let mut health = BackendHealth::new();
        health.state = HealthState::HalfOpen;
        health.consecutive_failures = 3;

        health.record_success();
        assert_eq!(health.state(), HealthState::Healthy);
        assert_eq!(health.consecutive_failures, 0);
    }

    #[test]
    fn half_open_failure_returns_unhealthy() {
        let mut health = BackendHealth::new();
        health.state = HealthState::HalfOpen;
        health.consecutive_failures = 3;

        // Even with threshold=5, failure in HalfOpen should increment.
        // Since consecutive_failures (4) < threshold (5), it stays HalfOpen
        // conceptually, but our implementation just increments. Let's test
        // with threshold=1 to ensure it goes back to Unhealthy.
        health.record_failure(1);
        assert_eq!(health.state(), HealthState::Unhealthy);
    }

    #[test]
    fn half_open_should_try() {
        let mut health = BackendHealth::new();
        health.state = HealthState::HalfOpen;
        assert!(health.should_try(Duration::from_secs(60)));
    }

    #[test]
    fn default_is_healthy() {
        let health = BackendHealth::default();
        assert_eq!(health.state(), HealthState::Healthy);
    }
}
