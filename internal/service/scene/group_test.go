package scene

import (
	"strings"
	"testing"

	"github.com/colinleefish/mypast/internal/model"
)

func strPtr(s string) *string { return &s }

func TestGroupAtomsBySceneName(t *testing.T) {
	atoms := []model.Atom{
		{URI: "a1", SceneName: strPtr("Hook Config"), Content: "one"},
		{URI: "a2", SceneName: nil, Content: "two"},
		{URI: "a3", SceneName: strPtr("Hook Config"), Content: "three"},
	}
	groups := groupAtomsBySceneName(atoms)
	if len(groups) != 2 {
		t.Fatalf("got %d groups want 2", len(groups))
	}
	if groups[0].DisplayName != "General" || len(groups[0].Atoms) != 1 {
		t.Fatalf("unexpected general group: %+v", groups[0])
	}
	if groups[1].DisplayName != "Hook Config" || len(groups[1].Atoms) != 2 {
		t.Fatalf("unexpected hook group: %+v", groups[1])
	}
}

func TestSerializeAtomsForLLM(t *testing.T) {
	groups := groupAtomsBySceneName([]model.Atom{
		{URI: "mypast://sessions/x/atoms/1", Category: "entities", Priority: 50, Content: "fact"},
	})
	raw, err := serializeAtomsForLLM(groups)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(raw, "mypast://sessions/x/atoms/1") {
		t.Fatalf("missing uri in json: %s", raw)
	}
}
