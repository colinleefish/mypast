package scene

import (
	"testing"
	"time"
)

func TestShouldRunT2_pendingAfterDelay(t *testing.T) {
	t1At := time.Now().Add(-2 * time.Minute)
	if !shouldRunT2(time.Now(), "idle", "pending", &t1At, 90*time.Second) {
		t.Fatal("expected pending to run after delay")
	}
}

func TestShouldRunT2_tooSoon(t *testing.T) {
	t1At := time.Now().Add(-30 * time.Second)
	if shouldRunT2(time.Now(), "idle", "pending", &t1At, 90*time.Second) {
		t.Fatal("expected too soon after t1 to skip")
	}
}

func TestShouldRunT2_t1Running(t *testing.T) {
	t1At := time.Now().Add(-5 * time.Minute)
	if shouldRunT2(time.Now(), "running", "pending", &t1At, 0) {
		t.Fatal("expected t1 running to skip")
	}
}

func TestShouldRunT2_failedRetry(t *testing.T) {
	t1At := time.Now().Add(-5 * time.Minute)
	if !shouldRunT2(time.Now(), "idle", "failed", &t1At, 0) {
		t.Fatal("expected failed to retry")
	}
}

func TestShouldRunT2_idleStatus(t *testing.T) {
	t1At := time.Now().Add(-5 * time.Minute)
	if shouldRunT2(time.Now(), "idle", "idle", &t1At, 0) {
		t.Fatal("expected idle t2 to skip")
	}
}

func TestShouldRunT2_noT1AdvancedAt(t *testing.T) {
	if shouldRunT2(time.Now(), "idle", "pending", nil, 0) {
		t.Fatal("expected missing t1_advanced_at to skip")
	}
}
