package pgarray

import "testing"

func TestVectorValue(t *testing.T) {
	v, err := Vector{0.1, -0.25, 3}.Value()
	if err != nil {
		t.Fatal(err)
	}
	got, ok := v.(string)
	if !ok {
		t.Fatalf("expected string, got %T", v)
	}
	if got != "[0.1,-0.25,3]" {
		t.Fatalf("Value() = %q", got)
	}
}

func TestVectorValue_nil(t *testing.T) {
	v, err := Vector(nil).Value()
	if err != nil {
		t.Fatal(err)
	}
	if v != nil {
		t.Fatalf("nil vector should produce nil driver value, got %v", v)
	}
}

func TestVectorScanRoundTrip(t *testing.T) {
	var dst Vector
	if err := dst.Scan("[0.1,-0.25,3]"); err != nil {
		t.Fatal(err)
	}
	if len(dst) != 3 || dst[0] != 0.1 || dst[1] != -0.25 || dst[2] != 3 {
		t.Fatalf("scan mismatch: %+v", []float32(dst))
	}
}

func TestVectorScan_nil(t *testing.T) {
	var dst Vector
	if err := dst.Scan(nil); err != nil {
		t.Fatal(err)
	}
	if dst != nil {
		t.Fatalf("expected nil, got %+v", dst)
	}
}
