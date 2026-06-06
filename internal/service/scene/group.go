package scene

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/colinleefish/mypast/internal/model"
)

const defaultSceneName = "General"

type atomInput struct {
	URI       string  `json:"uri"`
	Category  string  `json:"category"`
	Priority  int     `json:"priority"`
	SceneName string  `json:"scene_name"`
	Slug      *string `json:"slug,omitempty"`
	Content   string  `json:"content"`
}

type atomGroup struct {
	DisplayName string
	Atoms       []model.Atom
}

func groupAtomsBySceneName(atoms []model.Atom) []atomGroup {
	byName := make(map[string][]model.Atom)
	order := make([]string, 0)
	for _, atom := range atoms {
		name := defaultSceneName
		if atom.SceneName != nil {
			if trimmed := strings.TrimSpace(*atom.SceneName); trimmed != "" {
				name = trimmed
			}
		}
		if _, ok := byName[name]; !ok {
			order = append(order, name)
		}
		byName[name] = append(byName[name], atom)
	}
	sort.Strings(order)

	out := make([]atomGroup, 0, len(order))
	for _, name := range order {
		out = append(out, atomGroup{
			DisplayName: name,
			Atoms:       byName[name],
		})
	}
	return out
}

func serializeAtomsForLLM(groups []atomGroup) (string, error) {
	inputs := make([]atomInput, 0)
	for _, group := range groups {
		for _, atom := range group.Atoms {
			sceneName := defaultSceneName
			if atom.SceneName != nil {
				sceneName = strings.TrimSpace(*atom.SceneName)
			}
			inputs = append(inputs, atomInput{
				URI:       atom.URI,
				Category:  atom.Category,
				Priority:  atom.Priority,
				SceneName: sceneName,
				Slug:      atom.Slug,
				Content:   atom.Content,
			})
		}
	}
	raw, err := json.Marshal(map[string]any{"atoms": inputs})
	if err != nil {
		return "", fmt.Errorf("marshal atoms for llm: %w", err)
	}
	return string(raw), nil
}

func atomURIs(atoms []model.Atom) map[string]struct{} {
	out := make(map[string]struct{}, len(atoms))
	for _, atom := range atoms {
		out[atom.URI] = struct{}{}
	}
	return out
}
