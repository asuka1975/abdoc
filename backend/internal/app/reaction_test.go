package app_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/asuka1975/abdoc/backend/internal/app"
	"github.com/asuka1975/abdoc/backend/internal/domain"
	"github.com/asuka1975/abdoc/backend/internal/store/memory"
)

const visitor = "123e4567-e89b-12d3-a456-426614174000"

func newService(t *testing.T) (*app.Service, *memory.EventWriter) {
	t.Helper()
	events := &memory.EventWriter{}
	return app.NewService(memory.NewReactionStore(), events, slog.New(slog.NewTextHandler(io.Discard, nil))), events
}

func TestSetReactionFlow(t *testing.T) {
	ctx := context.Background()
	svc, events := newService(t)

	steps := []struct {
		variant domain.Variant
		press   domain.Reaction
		want    domain.ReactionState
		event   bool
		prev    domain.Reaction
	}{
		{domain.VariantA, domain.ReactionLike, domain.ReactionState{Counts: domain.Counts{Likes: 1}, MyReaction: domain.ReactionLike}, true, domain.ReactionNone}, // AC1
		{domain.VariantA, domain.ReactionLike, domain.ReactionState{Counts: domain.Counts{Likes: 1}, MyReaction: domain.ReactionLike}, false, ""},                 // AC4
		{domain.VariantA, domain.ReactionBad, domain.ReactionState{Counts: domain.Counts{Bads: 1}, MyReaction: domain.ReactionBad}, true, domain.ReactionLike},    // AC3
		{domain.VariantA, domain.ReactionNone, domain.ReactionState{MyReaction: domain.ReactionNone}, true, domain.ReactionBad},                                   // AC2
		{domain.VariantA, domain.ReactionNone, domain.ReactionState{MyReaction: domain.ReactionNone}, false, ""},                                                  // AC4
	}
	nEvents := 0
	for i, s := range steps {
		got, err := svc.SetReaction(ctx, "post", visitor, s.variant, s.press)
		if err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
		if got != s.want {
			t.Errorf("step %d: state = %+v, want %+v", i, got, s.want)
		}
		if s.event {
			nEvents++
		}
		evs := events.Reactions()
		if len(evs) != nEvents {
			t.Fatalf("step %d: %d events, want %d", i, len(evs), nEvents)
		}
		if s.event {
			e := evs[len(evs)-1]
			if e.Slug != "post" || e.Variant != s.variant || e.VisitorID != visitor || e.Reaction != s.press || e.PreviousReaction != s.prev || e.Timestamp.IsZero() {
				t.Errorf("step %d: event = %+v", i, e)
			}
		}
	}
}

func TestGetReactionAfterMove(t *testing.T) {
	ctx := context.Background()
	svc, _ := newService(t)
	if _, err := svc.SetReaction(ctx, "post", visitor, domain.VariantA, domain.ReactionLike); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetReaction(ctx, "post", visitor, domain.VariantB, domain.ReactionLike); err != nil {
		t.Fatal(err)
	}
	a, _ := svc.GetReaction(ctx, "post", visitor, domain.VariantA)
	b, _ := svc.GetReaction(ctx, "post", visitor, domain.VariantB)
	if a != (domain.ReactionState{MyReaction: domain.ReactionNone}) {
		t.Errorf("A = %+v, want 0 likes / none", a)
	}
	if b != (domain.ReactionState{Counts: domain.Counts{Likes: 1}, MyReaction: domain.ReactionLike}) {
		t.Errorf("B = %+v, want 1 like / like", b)
	}
}

func TestInvalidInputRecordsNothing(t *testing.T) {
	ctx := context.Background()
	svc, events := newService(t)
	cases := map[string]func() error{
		"slug": func() error {
			_, err := svc.SetReaction(ctx, "Bad", visitor, domain.VariantA, domain.ReactionLike)
			return err
		},
		"visitor": func() error {
			_, err := svc.SetReaction(ctx, "post", "nope", domain.VariantA, domain.ReactionLike)
			return err
		},
		"variant": func() error {
			_, err := svc.SetReaction(ctx, "post", visitor, "C", domain.ReactionLike)
			return err
		},
		"reaction": func() error {
			_, err := svc.SetReaction(ctx, "post", visitor, domain.VariantA, "love")
			return err
		},
		"get variant": func() error {
			_, err := svc.GetReaction(ctx, "post", visitor, "C")
			return err
		},
		"engagement depth": func() error {
			return svc.RecordEngagement(ctx, domain.Engagement{Slug: "post", Variant: domain.VariantA, VisitorID: visitor, MaxScrollDepth: 101})
		},
	}
	for name, call := range cases {
		if err := call(); !errors.Is(err, domain.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if len(events.Reactions()) != 0 || len(events.Engagements()) != 0 {
		t.Errorf("events written on invalid input")
	}
	st, _ := svc.GetReaction(ctx, "post", visitor, domain.VariantA)
	if st.Counts != (domain.Counts{}) {
		t.Errorf("counts changed on invalid input: %+v", st)
	}
}

func TestRecordEngagementAppendsEveryTime(t *testing.T) {
	ctx := context.Background()
	svc, events := newService(t)
	e := domain.Engagement{Slug: "post", Variant: domain.VariantB, VisitorID: visitor, MaxScrollDepth: 80, DurationSeconds: 12.5}
	for range 2 {
		if err := svc.RecordEngagement(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	got := events.Engagements()
	if len(got) != 2 {
		t.Fatalf("%d rows, want 2", len(got))
	}
	g := got[0]
	if g.Slug != "post" || g.Variant != domain.VariantB || g.VisitorID != visitor || g.MaxScrollDepth != 80 || g.DurationSeconds != 12.5 || g.Timestamp.IsZero() {
		t.Errorf("row = %+v", g)
	}
}

type failingEvents struct{}

func (failingEvents) WriteReaction(context.Context, domain.ReactionEvent) error {
	return errors.New("boom")
}
func (failingEvents) WriteEngagement(context.Context, domain.Engagement) error {
	return errors.New("boom")
}

func TestEventWriteFailure(t *testing.T) {
	ctx := context.Background()
	svc := app.NewService(memory.NewReactionStore(), failingEvents{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	st, err := svc.SetReaction(ctx, "post", visitor, domain.VariantA, domain.ReactionLike)
	if err != nil || st.Likes != 1 {
		t.Errorf("SetReaction = %+v, %v; want success（カウンターが正）", st, err)
	}
	err = svc.RecordEngagement(ctx, domain.Engagement{Slug: "post", Variant: domain.VariantA, VisitorID: visitor})
	if err == nil || errors.Is(err, domain.ErrInvalid) {
		t.Errorf("RecordEngagement err = %v, want write error", err)
	}
}
