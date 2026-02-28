"""
CoalesceFi SDK Idempotency Utilities.

This module provides utilities for preventing duplicate transactions.
When a transaction times out but actually succeeds on-chain, clients may
retry with a new blockhash, causing double execution (double deposits,
double borrows, etc.). This module provides client-side tracking to
prevent such duplicates.

Usage:
    from coalescefi_sdk.idempotency import IdempotencyManager, generate_idempotency_key

    manager = IdempotencyManager()

    # Generate a unique key for this operation
    key = generate_idempotency_key("deposit", {
        "market": str(market_pubkey),
        "amount": str(deposit_amount),
    })

    # Execute with idempotency protection
    result = await manager.execute_once(
        connection,
        key,
        async_operation,
    )
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

from solana.rpc.async_api import AsyncClient
from solders.signature import Signature

# =============================================================================
# Storage Interface
# =============================================================================


class Storage(Protocol):
    """Protocol for storage implementations."""

    def get_item(self, key: str) -> str | None:
        """Get an item from storage."""
        ...

    def set_item(self, key: str, value: str) -> None:
        """Set an item in storage."""
        ...

    def remove_item(self, key: str) -> None:
        """Remove an item from storage."""
        ...


class MemoryStorage:
    """In-memory storage implementation for testing."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def get_item(self, key: str) -> str | None:
        return self._store.get(key)

    def set_item(self, key: str, value: str) -> None:
        self._store[key] = value

    def remove_item(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        """Clear all stored operations (useful for testing)."""
        self._store.clear()


# =============================================================================
# Idempotency Types
# =============================================================================


class IdempotencyError(Exception):
    """Error thrown when an operation is already pending or completed."""

    def __init__(self, message: str, signature: str | None = None, status: str = "unknown"):
        self.signature = signature
        self.status = status  # 'pending' or 'completed'
        super().__init__(message)


@dataclass
class PendingOperation:
    """A pending operation being tracked."""

    key: str
    signature: str
    created_at: int
    expires_at: int
    metadata: dict[str, Any] | None = None


@dataclass
class IdempotencyManagerOptions:
    """Options for IdempotencyManager."""

    storage: Storage | None = None
    prefix: str = "coalescefi:pending:"
    pending_timeout: int = 90000  # 90 seconds
    completed_retention: int = 3600000  # 1 hour


T = TypeVar("T")


# =============================================================================
# Idempotency Manager
# =============================================================================


class IdempotencyManager:
    """
    Manager for preventing duplicate transaction submissions.

    Tracks pending and completed transactions to prevent accidental
    double-execution due to network timeouts or retry logic.
    """

    def __init__(self, options: IdempotencyManagerOptions | None = None) -> None:
        opts = options or IdempotencyManagerOptions()
        self._storage = opts.storage or MemoryStorage()
        self._prefix = opts.prefix
        self._pending_timeout = opts.pending_timeout
        self._completed_retention = opts.completed_retention

    async def execute_once(
        self,
        connection: AsyncClient,
        key: str,
        operation: Callable[[], Awaitable[tuple[str, T]]],
        metadata: dict[str, Any] | None = None,
    ) -> T:
        """
        Execute an operation with idempotency protection.

        If a previous operation with the same key is pending or completed,
        raises IdempotencyError instead of executing.

        Args:
            connection: Solana connection for checking transaction status.
            key: Unique idempotency key for this operation.
            operation: Async function that executes the operation and returns (signature, result).
            metadata: Optional metadata to store with the pending operation.

        Returns:
            The operation result.

        Raises:
            IdempotencyError: If operation is already pending or completed.
        """
        # Check for existing pending operation
        existing = self._get_pending(key)
        if existing is not None:
            # Verify status on-chain
            sig = Signature.from_string(existing.signature)
            status_resp = await connection.get_signature_statuses([sig])
            statuses = status_resp.value
            if statuses and statuses[0]:
                status = statuses[0]
                confirmation_status = status.confirmation_status
                if confirmation_status in ("confirmed", "finalized"):
                    # Transaction succeeded - mark as completed and reject retry
                    self.mark_completed(key, existing.signature)
                    raise IdempotencyError(
                        f"Operation already completed with signature: {existing.signature}",
                        existing.signature,
                        "completed",
                    )
                if status.err is not None:
                    # Transaction failed on-chain - safe to retry
                    self.clear_pending(key)
                elif int(time.time() * 1000) < existing.expires_at:
                    # Still within blockhash validity window - don't retry yet
                    raise IdempotencyError(
                        f"Operation still pending with signature: {existing.signature}",
                        existing.signature,
                        "pending",
                    )
                else:
                    # Blockhash expired, transaction never landed - safe to retry
                    self.clear_pending(key)
            else:
                # No status found
                if int(time.time() * 1000) >= existing.expires_at:
                    # Expired, safe to retry
                    self.clear_pending(key)
                else:
                    # Still pending
                    raise IdempotencyError(
                        f"Operation still pending with signature: {existing.signature}",
                        existing.signature,
                        "pending",
                    )

        # Check if this operation was recently completed
        completed = self._get_completed(key)
        if completed is not None:
            raise IdempotencyError(
                f"Operation already completed with signature: {completed}",
                completed,
                "completed",
            )

        # Execute the operation
        signature, result = await operation()

        # Store as pending
        pending_op = PendingOperation(
            key=key,
            signature=signature,
            created_at=int(time.time() * 1000),
            expires_at=int(time.time() * 1000) + self._pending_timeout,
            metadata=metadata,
        )
        self._set_pending(key, pending_op)

        return result

    def is_pending(self, key: str) -> bool:
        """Check if an operation with the given key is pending."""
        pending = self._get_pending(key)
        return pending is not None and int(time.time() * 1000) < pending.expires_at

    def is_completed(self, key: str) -> bool:
        """Check if an operation with the given key was recently completed."""
        return self._get_completed(key) is not None

    def get_signature(self, key: str) -> str | None:
        """Get the signature for a pending or completed operation."""
        pending = self._get_pending(key)
        if pending is not None:
            return pending.signature
        return self._get_completed(key)

    def mark_completed(self, key: str, signature: str) -> None:
        """
        Manually mark an operation as completed.
        Use this if you confirmed the transaction outside of execute_once.
        """
        self.clear_pending(key)
        completed_data = {
            "signature": signature,
            "completed_at": int(time.time() * 1000),
            "expires_at": int(time.time() * 1000) + self._completed_retention,
        }
        self._storage.set_item(f"{self._prefix}completed:{key}", json.dumps(completed_data))

    def clear_pending(self, key: str) -> None:
        """
        Manually clear a pending operation.
        Use this if you know the transaction failed or should be retried.
        """
        self._storage.remove_item(f"{self._prefix}{key}")

    def clear_all(self) -> None:
        """
        Clear all stored operations.
        Useful for testing or resetting state.
        """
        if isinstance(self._storage, MemoryStorage):
            self._storage.clear()

    def _get_pending(self, key: str) -> PendingOperation | None:
        """Get a pending operation by key."""
        data = self._storage.get_item(f"{self._prefix}{key}")
        if data is None:
            return None
        try:
            parsed = json.loads(data)
            # Check if expired
            if int(time.time() * 1000) > parsed.get("expires_at", 0):
                self._storage.remove_item(f"{self._prefix}{key}")
                return None
            return PendingOperation(
                key=parsed["key"],
                signature=parsed["signature"],
                created_at=parsed["created_at"],
                expires_at=parsed["expires_at"],
                metadata=parsed.get("metadata"),
            )
        except (json.JSONDecodeError, KeyError):
            self._storage.remove_item(f"{self._prefix}{key}")
            return None

    def _set_pending(self, key: str, op: PendingOperation) -> None:
        """Store a pending operation."""
        data = {
            "key": op.key,
            "signature": op.signature,
            "created_at": op.created_at,
            "expires_at": op.expires_at,
        }
        if op.metadata is not None:
            data["metadata"] = op.metadata
        self._storage.set_item(f"{self._prefix}{key}", json.dumps(data))

    def _get_completed(self, key: str) -> str | None:
        """Get a completed operation signature by key."""
        data = self._storage.get_item(f"{self._prefix}completed:{key}")
        if data is None:
            return None
        try:
            parsed = json.loads(data)
            # Check if retention period expired
            if int(time.time() * 1000) > parsed.get("expires_at", 0):
                self._storage.remove_item(f"{self._prefix}completed:{key}")
                return None
            return parsed.get("signature")
        except json.JSONDecodeError:
            self._storage.remove_item(f"{self._prefix}completed:{key}")
            return None


# =============================================================================
# Key Generation
# =============================================================================


def generate_idempotency_key(operation_type: str, params: dict[str, Any]) -> str:
    """
    Generate a deterministic idempotency key for an operation.

    The key should uniquely identify the operation intent, so that
    retrying the same logical operation uses the same key.

    Args:
        operation_type: Type of operation (e.g., 'deposit', 'borrow', 'repay').
        params: Operation parameters that define uniqueness.

    Returns:
        A deterministic idempotency key.

    Example:
        key = generate_idempotency_key("deposit", {
            "market": str(market_pubkey),
            "lender": str(lender_pubkey),
            "amount": "1000000",
            # Include timestamp bucket for time-based uniqueness
            "timestamp": str(int(time.time()) // 60),  # 1-minute buckets
        })
    """
    # Sort keys for deterministic ordering
    sorted_keys = sorted(params.keys())
    param_string = "&".join(f"{k}={params[k]}" for k in sorted_keys)
    return f"{operation_type}:{param_string}"


def generate_unique_idempotency_key(operation_type: str, params: dict[str, Any]) -> str:
    """
    Generate a unique idempotency key with a random component.

    Use this when you want each operation to be unique, preventing
    any form of deduplication. Useful for operations that should
    never be deduplicated even with identical parameters.

    Args:
        operation_type: Type of operation.
        params: Operation parameters.

    Returns:
        A unique idempotency key with random suffix.
    """
    base_key = generate_idempotency_key(operation_type, params)
    random_suffix = uuid.uuid4().hex[:8]
    timestamp = hex(int(time.time()))[2:]
    return f"{base_key}:{timestamp}:{random_suffix}"
