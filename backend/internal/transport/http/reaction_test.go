package http

import (
	"encoding/json"
	"io"
	"log/slog"
	nethttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/asuka1975/abdoc/backend/internal/app"
	"github.com/asuka1975/abdoc/backend/internal/store/memory"
	"github.com/asuka1975/abdoc/backend/internal/transport/http/api"
)

const testVisitor = "123e4567-e89b-12d3-a456-426614174000"

type testEnv struct {
	h      nethttp.Handler
	events *memory.EventWriter
}

func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	events := &memory.EventWriter{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	svc := app.NewService(memory.NewReactionStore(), events, logger)
	return testEnv{h: NewRouter(svc, logger), events: events}
}

func newTestRouter(t *testing.T) nethttp.Handler {
	t.Helper()
	return newTestEnv(t).h
}

func (e testEnv) do(t *testing.T, method, path, visitor, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	if visitor != "" {
		req.Header.Set(visitorIDHeader, visitor)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func decodeState(t *testing.T, rec *httptest.ResponseRecorder) api.ReactionState {
	t.Helper()
	if rec.Code != nethttp.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	var st api.ReactionState
	if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return st
}

func (e testEnv) put(t *testing.T, visitor, variant, reaction string) api.ReactionState {
	t.Helper()
	return decodeState(t, e.do(t, nethttp.MethodPut, "/api/posts/hello/reaction", visitor,
		`{"variant":"`+variant+`","reaction":"`+reaction+`"}`))
}

func (e testEnv) get(t *testing.T, visitor, variant string) api.ReactionState {
	t.Helper()
	return decodeState(t, e.do(t, nethttp.MethodGet, "/api/posts/hello/reaction?variant="+variant, visitor, ""))
}

func want(likes, bads int64, my api.Reaction) api.ReactionState {
	return api.ReactionState{Likes: likes, Bads: bads, MyReaction: my}
}

// AC1, AC2: いいね → 再押下（none）で −1。バッドも同じ。
func TestPutReactionLikeAndToggle(t *testing.T) {
	e := newTestEnv(t)
	if got := e.put(t, testVisitor, "A", "like"); got != want(1, 0, api.Like) {
		t.Errorf("like: %+v", got)
	}
	if got := e.get(t, testVisitor, "A"); got != want(1, 0, api.Like) {
		t.Errorf("get after like: %+v", got)
	}
	if got := e.put(t, testVisitor, "A", "none"); got != want(0, 0, api.None) {
		t.Errorf("none: %+v", got)
	}
	if got := e.put(t, testVisitor, "A", "bad"); got != want(0, 1, api.Bad) {
		t.Errorf("bad: %+v", got)
	}
	if got := e.put(t, testVisitor, "A", "none"); got != want(0, 0, api.None) {
		t.Errorf("bad -> none: %+v", got)
	}
}

// AC3: いいねとバッドは排他で、別の版で押したら付け替える。
func TestPutReactionSwitchAndMove(t *testing.T) {
	e := newTestEnv(t)
	e.put(t, testVisitor, "A", "bad")
	if got := e.put(t, testVisitor, "A", "like"); got != want(1, 0, api.Like) {
		t.Errorf("bad -> like: %+v", got)
	}
	if got := e.put(t, testVisitor, "A", "bad"); got != want(0, 1, api.Bad) {
		t.Errorf("like -> bad: %+v", got)
	}
	if got := e.put(t, testVisitor, "B", "like"); got != want(1, 0, api.Like) {
		t.Errorf("move to B: %+v", got)
	}
	if got := e.get(t, testVisitor, "A"); got != want(0, 0, api.None) {
		t.Errorf("A after move: %+v", got)
	}
}

// AC4, AC10: 同じ状態の再 PUT はカウンターもイベントも変えない。
func TestPutReactionIdempotent(t *testing.T) {
	e := newTestEnv(t)
	other := "00000000-0000-4000-8000-000000000001"
	e.put(t, other, "A", "like")
	first := e.put(t, testVisitor, "A", "like")
	second := e.put(t, testVisitor, "A", "like")
	if first != want(2, 0, api.Like) || second != first {
		t.Errorf("first=%+v second=%+v", first, second)
	}
	evs := e.events.Reactions()
	if len(evs) != 2 {
		t.Fatalf("%d reaction events, want 2", len(evs))
	}
	ev := evs[1]
	if ev.Slug != "hello" || ev.Variant != "A" || ev.VisitorID != testVisitor || ev.Reaction != "like" || ev.PreviousReaction != "none" || ev.Timestamp.IsZero() {
		t.Errorf("event = %+v", ev)
	}
}

// AC9: 記録が無い slug / 版でも 0 件と none。
func TestGetReactionEmpty(t *testing.T) {
	e := newTestEnv(t)
	if got := e.get(t, testVisitor, "B"); got != want(0, 0, api.None) {
		t.Errorf("empty: %+v", got)
	}
	rec := e.do(t, nethttp.MethodGet, "/api/posts/never-seen/reaction?variant=A", testVisitor, "")
	if got := decodeState(t, rec); got != want(0, 0, api.None) {
		t.Errorf("unknown slug: %+v", got)
	}
}

// AC10: engagement は 204 で、POST ごとに 1 行。
func TestPostEngagement(t *testing.T) {
	e := newTestEnv(t)
	for range 2 {
		rec := e.do(t, nethttp.MethodPost, "/api/posts/hello/engagement", testVisitor,
			`{"variant":"B","maxScrollDepth":75,"durationSeconds":12.5}`)
		if rec.Code != nethttp.StatusNoContent || rec.Body.Len() != 0 {
			t.Fatalf("status = %d body=%q, want 204", rec.Code, rec.Body)
		}
	}
	rows := e.events.Engagements()
	if len(rows) != 2 {
		t.Fatalf("%d rows, want 2", len(rows))
	}
	r := rows[0]
	if r.Slug != "hello" || r.Variant != "B" || r.VisitorID != testVisitor || r.MaxScrollDepth != 75 || r.DurationSeconds != 12.5 || r.Timestamp.IsZero() {
		t.Errorf("row = %+v", r)
	}
	for _, body := range []string{
		`{"variant":"A","maxScrollDepth":0,"durationSeconds":0}`,
		`{"variant":"A","maxScrollDepth":100,"durationSeconds":3600}`,
	} {
		if rec := e.do(t, nethttp.MethodPost, "/api/posts/hello/engagement", testVisitor, body); rec.Code != nethttp.StatusNoContent {
			t.Errorf("%s: status = %d, want 204", body, rec.Code)
		}
	}
}

func assertBadRequest(t *testing.T, e testEnv, name string, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != nethttp.StatusBadRequest {
		t.Errorf("%s: status = %d, want 400; body=%s", name, rec.Code, rec.Body)
		return
	}
	var er api.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &er); err != nil || er.Message == "" {
		t.Errorf("%s: body = %q, want Error JSON", name, rec.Body)
	}
}

func assertNothingRecorded(t *testing.T, e testEnv) {
	t.Helper()
	if n, m := len(e.events.Reactions()), len(e.events.Engagements()); n != 0 || m != 0 {
		t.Errorf("events written: %d reactions, %d engagements", n, m)
	}
	if got := e.get(t, testVisitor, "A"); got != want(0, 0, api.None) {
		t.Errorf("counter changed: %+v", got)
	}
	if got := e.get(t, testVisitor, "B"); got != want(0, 0, api.None) {
		t.Errorf("counter changed: %+v", got)
	}
}

// AC5: visitor ID が無い・UUID でないときは 3 本とも 400 で何も記録しない。
func TestVisitorIDRequired(t *testing.T) {
	ids := map[string]string{
		"missing":   "",
		"not uuid":  "visitor-1",
		"no dashes": "123e4567e89b12d3a456426614174000",
		"braces":    "{123e4567-e89b-12d3-a456-426614174000}",
		"urn":       "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
		"too long":  testVisitor + "0",
	}
	for name, id := range ids {
		e := newTestEnv(t)
		assertBadRequest(t, e, name+" GET", e.do(t, nethttp.MethodGet, "/api/posts/hello/reaction?variant=A", id, ""))
		assertBadRequest(t, e, name+" PUT", e.do(t, nethttp.MethodPut, "/api/posts/hello/reaction", id, `{"variant":"A","reaction":"like"}`))
		assertBadRequest(t, e, name+" POST", e.do(t, nethttp.MethodPost, "/api/posts/hello/engagement", id, `{"variant":"A","maxScrollDepth":10,"durationSeconds":1}`))
		assertNothingRecorded(t, e)
	}
}

// AC6: 未知の reaction / variant、範囲外・非整数の深さ、負の秒数、形式違反の slug は 400。
func TestInvalidInput(t *testing.T) {
	cases := []struct {
		name, method, path, body string
	}{
		{"get variant unknown", "GET", "/api/posts/hello/reaction?variant=C", ""},
		{"get variant missing", "GET", "/api/posts/hello/reaction", ""},
		{"get slug uppercase", "GET", "/api/posts/Hello/reaction?variant=A", ""},
		{"put reaction unknown", "PUT", "/api/posts/hello/reaction", `{"variant":"A","reaction":"love"}`},
		{"put variant unknown", "PUT", "/api/posts/hello/reaction", `{"variant":"C","reaction":"like"}`},
		{"put reaction missing", "PUT", "/api/posts/hello/reaction", `{"variant":"A"}`},
		{"put variant null", "PUT", "/api/posts/hello/reaction", `{"variant":null,"reaction":"like"}`},
		{"put not json", "PUT", "/api/posts/hello/reaction", `like`},
		{"put empty body", "PUT", "/api/posts/hello/reaction", ""},
		{"put slug underscore", "PUT", "/api/posts/hello_world/reaction", `{"variant":"A","reaction":"like"}`},
		{"put slug too long", "PUT", "/api/posts/" + strings.Repeat("a", 101) + "/reaction", `{"variant":"A","reaction":"like"}`},
		{"put slug encoded slash", "PUT", "/api/posts/a%2Fb/reaction", `{"variant":"A","reaction":"like"}`},
		{"eng depth 101", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":101,"durationSeconds":1}`},
		{"eng depth -1", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":-1,"durationSeconds":1}`},
		{"eng depth float", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":50.5,"durationSeconds":1}`},
		{"eng depth string", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":"50","durationSeconds":1}`},
		{"eng depth missing", "POST", "/api/posts/hello/engagement", `{"variant":"A","durationSeconds":1}`},
		{"eng duration negative", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":10,"durationSeconds":-1}`},
		{"eng duration missing", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":10}`},
		{"eng variant unknown", "POST", "/api/posts/hello/engagement", `{"variant":"b","maxScrollDepth":10,"durationSeconds":1}`},
		{"eng slug invalid", "POST", "/api/posts/bad.slug/engagement", `{"variant":"A","maxScrollDepth":10,"durationSeconds":1}`},
		{"eng body too large", "POST", "/api/posts/hello/engagement", `{"variant":"A","maxScrollDepth":10,"durationSeconds":1,"pad":"` + strings.Repeat("x", maxBodyBytes) + `"}`},
	}
	for _, c := range cases {
		e := newTestEnv(t)
		assertBadRequest(t, e, c.name, e.do(t, c.method, c.path, testVisitor, c.body))
		assertNothingRecorded(t, e)
	}
}
