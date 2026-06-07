// Package embed fills the vector(1024) embedding columns on atoms, scenes, and
// memories. Rows with embedding IS NULL are the work queue; this makes backfill
// and steady-state incremental embedding the same idempotent operation.
package embed

import (
	"context"
	"fmt"

	"gorm.io/gorm"
)

// Embedding source text per tier is selected in SQL (abstract, falling back to
// body) so it never leaves the database; see worker.go.

// TierStatus reports embedding coverage for one table.
type TierStatus struct {
	Tier    string
	Total   int64
	Pending int64 // embedding IS NULL (active rows only for memories)
}

// Status returns embedding coverage across atoms, scenes, and active memories.
func Status(ctx context.Context, db *gorm.DB) ([]TierStatus, error) {
	queries := []struct {
		tier  string
		total string
		pend  string
	}{
		{"atoms", `SELECT count(*) FROM atoms`, `SELECT count(*) FROM atoms WHERE embedding IS NULL`},
		{"scenes", `SELECT count(*) FROM scenes`, `SELECT count(*) FROM scenes WHERE embedding IS NULL`},
		{"memories",
			`SELECT count(*) FROM memories WHERE superseded_at IS NULL`,
			`SELECT count(*) FROM memories WHERE embedding IS NULL AND superseded_at IS NULL`},
	}
	out := make([]TierStatus, 0, len(queries))
	for _, q := range queries {
		var total, pend int64
		if err := db.WithContext(ctx).Raw(q.total).Scan(&total).Error; err != nil {
			return nil, fmt.Errorf("count %s total: %w", q.tier, err)
		}
		if err := db.WithContext(ctx).Raw(q.pend).Scan(&pend).Error; err != nil {
			return nil, fmt.Errorf("count %s pending: %w", q.tier, err)
		}
		out = append(out, TierStatus{Tier: q.tier, Total: total, Pending: pend})
	}
	return out, nil
}
