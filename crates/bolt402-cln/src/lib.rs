//! # bolt402-cln
//!
//! Core Lightning (CLN) backend adapters for the bolt402 L402 client SDK.
//!
//! This crate provides two implementations of [`bolt402_proto::LnBackend`]:
//!
//! - **gRPC** (feature `grpc`, enabled by default): Uses CLN's gRPC API via
//!   `tonic` with vendored proto files. Requires mutual TLS (mTLS) with CA
//!   certificate, client certificate, and client key.
//!
//! - **REST** (feature `rest`): Uses the c-lightning-REST plugin API via
//!   `reqwest`. Simpler to configure, works in WASM/browser environments,
//!   and supports both macaroon and rune authentication.
//!
//! Both features can be enabled simultaneously.
//!
//! ## gRPC Example
//!
//! ```rust,no_run
//! # #[cfg(feature = "grpc")]
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! use bolt402_cln::ClnGrpcBackend;
//! use bolt402_proto::LnBackend;
//!
//! let backend = ClnGrpcBackend::connect(
//!     "https://localhost:9736",
//!     "/path/to/ca.pem",
//!     "/path/to/client.pem",
//!     "/path/to/client-key.pem",
//! ).await?;
//!
//! let info = backend.get_info().await?;
//! println!("Connected to: {} ({})", info.alias, info.pubkey);
//! # Ok(())
//! # }
//! ```
//!
//! ## REST Example (macaroon)
//!
//! ```rust,no_run
//! # #[cfg(feature = "rest")]
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! use bolt402_cln::ClnRestBackend;
//! use bolt402_proto::LnBackend;
//!
//! let backend = ClnRestBackend::new(
//!     "https://localhost:3001",
//!     "0201036c6e640258030a...",  // hex-encoded macaroon
//! )?;
//!
//! let info = backend.get_info().await?;
//! println!("Connected to: {} ({})", info.alias, info.pubkey);
//! # Ok(())
//! # }
//! ```
//!
//! ## REST Example (rune)
//!
//! ```rust,no_run
//! # #[cfg(feature = "rest")]
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! use bolt402_cln::ClnRestBackend;
//! use bolt402_proto::LnBackend;
//!
//! let backend = ClnRestBackend::with_rune(
//!     "https://localhost:3001",
//!     "rune_token_value...",
//! )?;
//!
//! let info = backend.get_info().await?;
//! println!("Connected to: {} ({})", info.alias, info.pubkey);
//! # Ok(())
//! # }
//! ```
//!
//! ## Architecture
//!
//! This crate is an adapter in the hexagonal architecture. Both backends
//! implement the [`bolt402_proto::LnBackend`] port trait.

pub mod error;

#[cfg(feature = "grpc")]
mod grpc;

#[cfg(feature = "rest")]
mod rest;

/// Generated CLN gRPC types.
#[cfg(feature = "grpc")]
#[allow(
    clippy::all,
    clippy::pedantic,
    missing_docs,
    unused_qualifications,
    unreachable_pub,
    rustdoc::invalid_html_tags
)]
pub mod cln {
    tonic::include_proto!("cln");
}

// Re-exports
pub use error::ClnError;

#[cfg(feature = "grpc")]
pub use grpc::ClnGrpcBackend;

#[cfg(feature = "rest")]
pub use rest::ClnRestBackend;

// Backwards compatibility: when only grpc is enabled, also export as ClnBackend
#[cfg(all(feature = "grpc", not(feature = "rest")))]
pub use grpc::ClnGrpcBackend as ClnBackend;
