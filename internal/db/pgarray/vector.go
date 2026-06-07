package pgarray

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"strings"
)

// Vector maps Go []float32 to a pgvector `vector` column. pgvector accepts and
// emits the text form "[0.1,0.2,...]".
type Vector []float32

func (v Vector) Value() (driver.Value, error) {
	if v == nil {
		return nil, nil
	}
	var b strings.Builder
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(f), 'f', -1, 32))
	}
	b.WriteByte(']')
	return b.String(), nil
}

func (v *Vector) Scan(src any) error {
	if src == nil {
		*v = nil
		return nil
	}
	var s string
	switch t := src.(type) {
	case string:
		s = t
	case []byte:
		s = string(t)
	default:
		return fmt.Errorf("pgarray.Vector: cannot scan %T", src)
	}
	s = strings.TrimSpace(s)
	if s == "" {
		*v = nil
		return nil
	}
	if len(s) < 2 || s[0] != '[' || s[len(s)-1] != ']' {
		return fmt.Errorf("pgarray.Vector: invalid vector literal %q", s)
	}
	inner := strings.TrimSpace(s[1 : len(s)-1])
	if inner == "" {
		*v = Vector{}
		return nil
	}
	parts := strings.Split(inner, ",")
	out := make(Vector, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		f, err := strconv.ParseFloat(p, 32)
		if err != nil {
			return fmt.Errorf("pgarray.Vector: parse %q: %w", p, err)
		}
		out = append(out, float32(f))
	}
	*v = out
	return nil
}
