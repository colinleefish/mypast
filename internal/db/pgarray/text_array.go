package pgarray

import (
	"database/sql/driver"
	"fmt"
	"strings"
)

// TextArray maps Go []string to Postgres text[] (GORM/pg driver default is wrong).
type TextArray []string

func (a TextArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}
	parts := make([]string, len(a))
	for i, s := range a {
		parts[i] = quoteTextArrayElement(s)
	}
	return "{" + strings.Join(parts, ",") + "}", nil
}

func (a *TextArray) Scan(value any) error {
	if value == nil {
		*a = nil
		return nil
	}
	var s string
	switch v := value.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("pgarray.TextArray: cannot scan %T", value)
	}
	return a.scanString(s)
}

func (a *TextArray) scanString(s string) error {
	s = strings.TrimSpace(s)
	if s == "" || s == "{}" {
		*a = TextArray{}
		return nil
	}
	if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
		return fmt.Errorf("pgarray.TextArray: invalid array literal %q", s)
	}
	inner := strings.TrimSpace(s[1 : len(s)-1])
	if inner == "" {
		*a = TextArray{}
		return nil
	}

	out := make(TextArray, 0)
	for _, elem := range splitTextArrayElements(inner) {
		elem = strings.TrimSpace(elem)
		if elem == "" {
			continue
		}
		if len(elem) >= 2 && elem[0] == '"' && elem[len(elem)-1] == '"' {
			elem = unquoteTextArrayElement(elem[1 : len(elem)-1])
		}
		out = append(out, elem)
	}
	*a = out
	return nil
}

func quoteTextArrayElement(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func unquoteTextArrayElement(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			i++
			b.WriteByte(s[i])
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func splitTextArrayElements(inner string) []string {
	var out []string
	var cur strings.Builder
	inQuotes := false
	for i := 0; i < len(inner); i++ {
		ch := inner[i]
		if inQuotes {
			if ch == '\\' && i+1 < len(inner) {
				i++
				cur.WriteByte(inner[i])
				continue
			}
			if ch == '"' {
				inQuotes = false
				continue
			}
			cur.WriteByte(ch)
			continue
		}
		switch ch {
		case '"':
			inQuotes = true
		case ',':
			out = append(out, cur.String())
			cur.Reset()
		default:
			cur.WriteByte(ch)
		}
	}
	out = append(out, cur.String())
	return out
}
