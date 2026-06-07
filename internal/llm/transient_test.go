package llm

import (
	"errors"
	"testing"
)

func TestIsTransientError(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{errors.New(`llm http 429: rate limit`), true},
		{errors.New(`您的账户已达到速率限制`), true},
		{errors.New(`context deadline exceeded`), true},
		{errors.New(`parse atoms json: invalid`), false},
	}
	for _, tc := range cases {
		if got := IsTransientError(tc.err); got != tc.want {
			t.Fatalf("IsTransientError(%q) = %v, want %v", tc.err, got, tc.want)
		}
	}
}
