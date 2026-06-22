package hook

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// codexPayload covers the Codex Stop hook payload shape.
// Key fields that distinguish Codex from Cursor and Claude Code:
//   - model: Codex-specific extension not present in Claude Code payloads
//   - transcript_path: points into ~/.codex/sessions/ for genuine Codex invocations
//
// Fields shared with Claude Code (cwd, stop_hook_active, last_assistant_message,
// session_id, hook_event_name) are present in both; the model field or transcript
// path is the primary discriminator.
type codexPayload struct {
	SessionID            string `json:"session_id"`
	TranscriptPath       string `json:"transcript_path"`
	Cwd                  string `json:"cwd"`
	LastAssistantMessage string `json:"last_assistant_message"`
	StopHookActive       bool   `json:"stop_hook_active"`
	PermissionMode       string `json:"permission_mode"`
	HookEventName        string `json:"hook_event_name"`
	Model                string `json:"model"` // Codex-specific
	TurnID               string `json:"turn_id"` // Codex-specific
}

// isCodexPayload returns true when the payload is Codex-originated.
// Detection priority:
//  1. model field present (Codex-specific extension absent from Claude Code)
//  2. transcript_path under ~/.codex/
func isCodexPayload(raw []byte) bool {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return false
	}
	var p codexPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return false
	}
	if strings.TrimSpace(p.Model) != "" {
		return true
	}
	if tp := strings.TrimSpace(p.TranscriptPath); tp != "" {
		home, _ := os.UserHomeDir()
		if home != "" && strings.HasPrefix(tp, home+"/.codex/") {
			return true
		}
	}
	return false
}

// buildMessagesFromCodexPayload returns the (user, assistant) pair for a
// Codex Stop event.
//
// Strategy:
//   - assistant = last_assistant_message from the payload (Codex fires Stop
//     with this field populated, same as Claude Code).
//   - user = the last user_message event in the transcript. Codex transcripts
//     use type:"event_msg" + payload.type:"user_message" + payload.message
//     rather than a direct role:"user" entry.
//
// If no user prompt is found (e.g. first turn, transcript unavailable), the
// assistant message is uploaded alone.
func buildMessagesFromCodexPayload(raw []byte) (sessionID string, messages []uploadMessage, reason string, err error) {
	var p codexPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return "", nil, "", fmt.Errorf("decode codex payload: %w", err)
	}

	sessionID = strings.ToLower(strings.TrimSpace(p.SessionID))
	if sessionID == "" {
		return "", nil, "", fmt.Errorf("codex payload missing session_id")
	}

	assistant := strings.TrimSpace(p.LastAssistantMessage)
	if assistant == "" {
		return "", nil, "", fmt.Errorf("codex payload: last_assistant_message is empty")
	}

	userText := codexFindLastUserMessage(p.TranscriptPath)

	out := make([]uploadMessage, 0, 2)
	if userText != "" {
		out = append(out, uploadMessage{Role: "user", Content: userText})
	}
	out = append(out, uploadMessage{Role: "assistant", Content: assistant})

	if userText == "" {
		return sessionID, out, "last_assistant_message only (no user found)", nil
	}
	return sessionID, out, "user from transcript + assistant from payload", nil
}

// codexTranscriptLine is one entry in a Codex session JSONL transcript.
// Codex transcripts use a typed envelope: { type, timestamp, payload }.
// User prompts appear as type:"event_msg" with payload.type:"user_message"
// and payload.message holding the actual text.
type codexTranscriptLine struct {
	Type    string `json:"type"`
	Payload struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"payload"`
}

// codexFindLastUserMessage scans the Codex transcript at path and returns the
// last user_message payload.message text. Returns "" if none is found.
func codexFindLastUserMessage(transcriptPath string) string {
	transcriptPath = strings.TrimSpace(transcriptPath)
	if transcriptPath == "" {
		return ""
	}
	f, err := os.Open(transcriptPath)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 8*1024*1024)
	last := ""
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var row codexTranscriptLine
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		if row.Type != "event_msg" || row.Payload.Type != "user_message" {
			continue
		}
		if msg := strings.TrimSpace(row.Payload.Message); msg != "" {
			last = msg
		}
	}
	return last
}
