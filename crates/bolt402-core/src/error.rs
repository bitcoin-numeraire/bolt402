//! Errors that can occur during L402 client operations.

use bolt402_proto::L402Error;
use thiserror::Error;

/// Errors that can occur during L402 client operations.
#[derive(Debug, Error)]
pub enum ClientError {
    /// L402 protocol error (challenge parsing, token construction).
    #[error("L402 protocol error: {0}")]
    Protocol(#[from] L402Error),

    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// Lightning payment failed.
    #[error("payment failed: {reason}")]
    PaymentFailed {
        /// Description of why the payment failed.
        reason: String,
    },

    /// Budget limit exceeded.
    #[error("budget exceeded: {reason}")]
    BudgetExceeded {
        /// Description of which budget limit was exceeded.
        reason: String,
    },

    /// The server did not return a valid L402 challenge with the 402 response.
    #[error("server returned 402 but no valid WWW-Authenticate header")]
    MissingChallenge,

    /// The invoice expired before payment could complete.
    #[error("invoice expired")]
    InvoiceExpired,

    /// The request was not retried successfully after payment.
    #[error("retry after payment failed: {reason}")]
    RetryFailed {
        /// Description of why the retry failed.
        reason: String,
    },

    /// Backend-specific error.
    #[error("backend error: {reason}")]
    Backend {
        /// Description of the backend error.
        reason: String,
    },

    /// All backends in a failover chain failed.
    #[error("all backends failed: {reason}")]
    AllBackendsFailed {
        /// Description of the combined failure.
        reason: String,
    },
}

impl ClientError {
    /// Whether this error should trigger failover to the next backend.
    ///
    /// Infrastructure errors (backend unreachable, payment failed due to
    /// liquidity) trigger failover. Application-level errors (budget exceeded,
    /// invoice expired, protocol parsing) do not.
    pub fn is_failover_eligible(&self) -> bool {
        matches!(
            self,
            Self::Backend { .. } | Self::PaymentFailed { .. } | Self::Http(..)
        )
    }
}
