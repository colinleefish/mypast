package scene

import "testing"

func TestParseBuildScenesResponse(t *testing.T) {
	valid := map[string]struct{}{
		"mypast://sessions/x/atoms/a1": {},
		"mypast://sessions/x/atoms/a2": {},
	}
	raw := `{"scenes":[{"display_name":"Setup","abstract":"Hook setup.","body":"## Setup\nConfigured hooks.","atom_uris":["mypast://sessions/x/atoms/a1","mypast://sessions/x/atoms/a2"]}]}`
	scenes, err := parseBuildScenesResponse(raw, valid)
	if err != nil {
		t.Fatal(err)
	}
	if len(scenes) != 1 {
		t.Fatalf("got %d scenes", len(scenes))
	}
	if scenes[0].DisplayName != "Setup" || len(scenes[0].SourceAtomURIs) != 2 {
		t.Fatalf("unexpected scene: %+v", scenes[0])
	}
}

func TestParseBuildScenesResponse_unknownURI(t *testing.T) {
	valid := map[string]struct{}{"mypast://sessions/x/atoms/a1": {}}
	raw := `{"scenes":[{"display_name":"X","abstract":"a","body":"b","atom_uris":["mypast://bad"]}]}`
	if _, err := parseBuildScenesResponse(raw, valid); err == nil {
		t.Fatal("expected unknown uri error")
	}
}

func TestParseBuildScenesResponse_fence(t *testing.T) {
	valid := map[string]struct{}{"mypast://sessions/x/atoms/a1": {}}
	raw := "```json\n{\"scenes\":[{\"display_name\":\"X\",\"abstract\":\"a\",\"body\":\"b\",\"atom_uris\":[\"mypast://sessions/x/atoms/a1\"]}]}\n```"
	scenes, err := parseBuildScenesResponse(raw, valid)
	if err != nil {
		t.Fatal(err)
	}
	if len(scenes) != 1 {
		t.Fatalf("got %d scenes", len(scenes))
	}
}
