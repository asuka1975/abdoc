package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/asuka1975/abdoc/backend/internal/domain"
	"github.com/asuka1975/abdoc/backend/internal/transport/http/api"
)

// maxBodyBytes はリクエストボディの上限。
const maxBodyBytes = 4 << 10

const visitorIDHeader = "X-Abdoc-Visitor-Id"

// Reactions はハンドラが使うユースケース（*app.Service が実装する）。
type Reactions interface {
	GetReaction(ctx context.Context, slug, visitorID string, v domain.Variant) (domain.ReactionState, error)
	SetReaction(ctx context.Context, slug, visitorID string, v domain.Variant, r domain.Reaction) (domain.ReactionState, error)
	RecordEngagement(ctx context.Context, e domain.Engagement) error
}

// GetReaction は GET /api/posts/{slug}/reaction を処理する。
func (s server) GetReaction(w http.ResponseWriter, r *http.Request, slug api.Slug, params api.GetReactionParams) {
	st, err := s.reactions.GetReaction(r.Context(), slug, visitorID(r), domain.Variant(params.Variant))
	if err != nil {
		s.writeAppError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toReactionState(st))
}

// PutReaction は PUT /api/posts/{slug}/reaction を処理する。
func (s server) PutReaction(w http.ResponseWriter, r *http.Request, slug api.Slug, _ api.PutReactionParams) {
	var body api.PutReactionRequest
	if err := decodeBody(w, r, &body, "variant", "reaction"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	st, err := s.reactions.SetReaction(r.Context(), slug, visitorID(r), domain.Variant(body.Variant), domain.Reaction(body.Reaction))
	if err != nil {
		s.writeAppError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toReactionState(st))
}

// PostEngagement は POST /api/posts/{slug}/engagement を処理する。
func (s server) PostEngagement(w http.ResponseWriter, r *http.Request, slug api.Slug, _ api.PostEngagementParams) {
	var body api.EngagementRequest
	if err := decodeBody(w, r, &body, "variant", "maxScrollDepth", "durationSeconds"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	err := s.reactions.RecordEngagement(r.Context(), domain.Engagement{
		Slug:            slug,
		Variant:         domain.Variant(body.Variant),
		VisitorID:       visitorID(r),
		MaxScrollDepth:  body.MaxScrollDepth,
		DurationSeconds: body.DurationSeconds,
	})
	if err != nil {
		s.writeAppError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// visitorID はヘッダーの値をそのまま（小文字にして）返す。形式は app 層で検証する。
// 生成コードの UUID 変換は波括弧や urn: 形式も受け付けるため、元の文字列を使う。
func visitorID(r *http.Request) string {
	return strings.ToLower(r.Header.Get(visitorIDHeader))
}

// decodeBody は JSON ボディを v に読み込み、required のキーがすべてあること（null でないこと）を確かめる。
func decodeBody(w http.ResponseWriter, r *http.Request, v any, required ...string) error {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return errors.New("body must be a JSON object")
	}
	for _, k := range required {
		if f, ok := fields[k]; !ok || bytes.Equal(f, []byte("null")) {
			return fmt.Errorf("%s is required", k)
		}
	}
	if err := json.Unmarshal(raw, v); err != nil {
		return fmt.Errorf("invalid body: %w", err)
	}
	return nil
}

func (s server) writeAppError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, domain.ErrInvalid) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.logger.ErrorContext(r.Context(), "request failed", slog.Any("error", err), slog.String("path", r.URL.Path))
	writeError(w, http.StatusInternalServerError, http.StatusText(http.StatusInternalServerError))
}

func toReactionState(st domain.ReactionState) api.ReactionState {
	return api.ReactionState{Likes: st.Likes, Bads: st.Bads, MyReaction: api.Reaction(st.MyReaction)}
}
