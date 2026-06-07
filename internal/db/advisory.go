package db

import (
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TrySessionAdvisoryXactLock acquires a transaction-scoped advisory lock for one session.
func TrySessionAdvisoryXactLock(tx *gorm.DB, sessionID uuid.UUID) (bool, error) {
	var locked bool
	if err := tx.Raw(
		`SELECT pg_try_advisory_xact_lock(hashtextextended(CAST(? AS text), 0))`,
		sessionID.String(),
	).Scan(&locked).Error; err != nil {
		return false, fmt.Errorf("acquire advisory lock: %w", err)
	}
	return locked, nil
}

// TryGlobalAdvisoryLock acquires a session-level advisory lock for a named global
// resource (e.g. the single T3 rollup). Held until GlobalAdvisoryUnlock or the
// connection closes, so it must be used on a pinned connection (gorm Connection).
// This avoids holding a long-running transaction while the rollup makes LLM calls.
func TryGlobalAdvisoryLock(conn *gorm.DB, key string) (bool, error) {
	var locked bool
	if err := conn.Raw(
		`SELECT pg_try_advisory_lock(hashtextextended(CAST(? AS text), 0))`,
		key,
	).Scan(&locked).Error; err != nil {
		return false, fmt.Errorf("acquire global advisory lock: %w", err)
	}
	return locked, nil
}

// GlobalAdvisoryUnlock releases a lock taken by TryGlobalAdvisoryLock. Must run on
// the same pinned connection that acquired it.
func GlobalAdvisoryUnlock(conn *gorm.DB, key string) error {
	if err := conn.Exec(
		`SELECT pg_advisory_unlock(hashtextextended(CAST(? AS text), 0))`,
		key,
	).Error; err != nil {
		return fmt.Errorf("release global advisory lock: %w", err)
	}
	return nil
}
