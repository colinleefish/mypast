package memory

import (
	"errors"
	"testing"
)

func TestParseDistillResponse(t *testing.T) {
	pm, err := parseDistillResponse(`{"abstract":"a","body":"## Profile\nLives in Beijing."}`)
	if err != nil {
		t.Fatal(err)
	}
	if pm.Abstract != "a" || pm.Body == "" {
		t.Fatalf("unexpected: %+v", pm)
	}
}

func TestParseDistillResponse_fence(t *testing.T) {
	raw := "```json\n{\"abstract\":\"a\",\"body\":\"b\"}\n```"
	pm, err := parseDistillResponse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if pm.Body != "b" {
		t.Fatalf("got %q", pm.Body)
	}
}

func TestParseDistillResponse_emptyBody(t *testing.T) {
	if _, err := parseDistillResponse(`{"abstract":"a","body":"   "}`); err == nil {
		t.Fatal("expected empty body error")
	}
}

func TestParseDistillResponse_abstractFallsBackToBody(t *testing.T) {
	pm, err := parseDistillResponse(`{"body":"only body"}`)
	if err != nil {
		t.Fatal(err)
	}
	if pm.Abstract != "only body" {
		t.Fatalf("expected abstract to fall back to body, got %q", pm.Abstract)
	}
}

func TestIsTransient(t *testing.T) {
	if !isTransient(errors.New("llm http 429: rate limit")) {
		t.Fatal("429 should be transient")
	}
	if isTransient(errors.New("decode memory json: bad")) {
		t.Fatal("parse error should not be transient")
	}
}
