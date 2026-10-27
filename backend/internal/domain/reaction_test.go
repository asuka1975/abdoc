package domain

import (
	"math"
	"testing"
)

func TestApply(t *testing.T) {
	none := VisitorReaction{Reaction: ReactionNone}
	likeA := VisitorReaction{Variant: VariantA, Reaction: ReactionLike}
	badA := VisitorReaction{Variant: VariantA, Reaction: ReactionBad}
	likeB := VisitorReaction{Variant: VariantB, Reaction: ReactionLike}

	tests := []struct {
		name    string
		cur     VisitorReaction
		variant Variant
		press   Reaction
		next    VisitorReaction
		deltas  map[Variant]Delta
		changed bool
	}{
		// AC1
		{"none -> like", none, VariantA, ReactionLike, likeA, map[Variant]Delta{VariantA: {Likes: 1}}, true},
		{"none -> bad", none, VariantB, ReactionBad, VisitorReaction{VariantB, ReactionBad}, map[Variant]Delta{VariantB: {Bads: 1}}, true},
		// AC2
		{"like -> none", likeA, VariantA, ReactionNone, VisitorReaction{VariantA, ReactionNone}, map[Variant]Delta{VariantA: {Likes: -1}}, true},
		{"bad -> none", badA, VariantA, ReactionNone, VisitorReaction{VariantA, ReactionNone}, map[Variant]Delta{VariantA: {Bads: -1}}, true},
		// AC3
		{"bad -> like", badA, VariantA, ReactionLike, likeA, map[Variant]Delta{VariantA: {Likes: 1, Bads: -1}}, true},
		{"like -> bad", likeA, VariantA, ReactionBad, badA, map[Variant]Delta{VariantA: {Likes: -1, Bads: 1}}, true},
		{"like A -> like B（付け替え）", likeA, VariantB, ReactionLike, likeB, map[Variant]Delta{VariantA: {Likes: -1}, VariantB: {Likes: 1}}, true},
		{"like A -> bad B（付け替え）", likeA, VariantB, ReactionBad, VisitorReaction{VariantB, ReactionBad}, map[Variant]Delta{VariantA: {Likes: -1}, VariantB: {Bads: 1}}, true},
		{"like A -> none B（解除）", likeA, VariantB, ReactionNone, VisitorReaction{VariantB, ReactionNone}, map[Variant]Delta{VariantA: {Likes: -1}}, true},
		// AC4
		{"like -> like（冪等）", likeA, VariantA, ReactionLike, likeA, map[Variant]Delta{}, false},
		{"bad -> bad（冪等）", badA, VariantA, ReactionBad, badA, map[Variant]Delta{}, false},
		{"none -> none（冪等）", none, VariantA, ReactionNone, none, map[Variant]Delta{}, false},
		{"none A -> none B（冪等）", VisitorReaction{VariantA, ReactionNone}, VariantB, ReactionNone, VisitorReaction{VariantA, ReactionNone}, map[Variant]Delta{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Apply(tt.cur, tt.variant, tt.press)
			if got.Changed != tt.changed {
				t.Errorf("Changed = %v, want %v", got.Changed, tt.changed)
			}
			if got.Prev != tt.cur {
				t.Errorf("Prev = %+v, want %+v", got.Prev, tt.cur)
			}
			if got.Next != tt.next {
				t.Errorf("Next = %+v, want %+v", got.Next, tt.next)
			}
			for _, v := range []Variant{VariantA, VariantB} {
				if got.Deltas[v] != tt.deltas[v] {
					t.Errorf("Deltas[%s] = %+v, want %+v", v, got.Deltas[v], tt.deltas[v])
				}
			}
		})
	}
}

func TestMyReactionFor(t *testing.T) {
	likeA := VisitorReaction{Variant: VariantA, Reaction: ReactionLike}
	if got := likeA.For(VariantA); got != ReactionLike {
		t.Errorf("For(A) = %q, want like", got)
	}
	if got := likeA.For(VariantB); got != ReactionNone {
		t.Errorf("For(B) = %q, want none", got)
	}
	if got := (VisitorReaction{}).For(VariantA); got != ReactionNone {
		t.Errorf("zero.For(A) = %q, want none", got)
	}
}

func TestCountsAdd(t *testing.T) {
	c := Counts{Likes: 1, Bads: 0}.Add(Delta{Likes: -2, Bads: 1})
	if c != (Counts{Likes: 0, Bads: 1}) {
		t.Errorf("Add = %+v, want {0 1}（負にならない）", c)
	}
}

func TestValidators(t *testing.T) {
	slugs := map[string]bool{
		"hello-world": true, "a": true, "0-9": true,
		"": false, "Hello": false, "a_b": false, "a/b": false, "日本語": false,
		string(make([]byte, 101)): false,
	}
	long := ""
	for range 100 {
		long += "a"
	}
	slugs[long] = true
	slugs[long+"a"] = false
	for s, want := range slugs {
		if got := ValidSlug(s); got != want {
			t.Errorf("ValidSlug(%q) = %v, want %v", s, got, want)
		}
	}

	ids := map[string]bool{
		"123e4567-e89b-12d3-a456-426614174000":          true,
		"123E4567-E89B-12D3-A456-426614174000":          true,
		"":                                              false,
		"not-a-uuid":                                    false,
		"123e4567e89b12d3a456426614174000":              false,
		"{123e4567-e89b-12d3-a456-426614174000}":        false,
		"urn:uuid:123e4567-e89b-12d3-a456-426614174000": false,
		"123e4567-e89b-12d3-a456-42661417400g":          false,
		" 123e4567-e89b-12d3-a456-426614174000":         false,
	}
	for s, want := range ids {
		if got := ValidVisitorID(s); got != want {
			t.Errorf("ValidVisitorID(%q) = %v, want %v", s, got, want)
		}
	}

	for _, v := range []Variant{VariantA, VariantB} {
		if !v.Valid() {
			t.Errorf("%q should be valid", v)
		}
	}
	for _, v := range []Variant{"", "C", "a"} {
		if v.Valid() {
			t.Errorf("variant %q should be invalid", v)
		}
	}
	for _, r := range []Reaction{ReactionLike, ReactionBad, ReactionNone} {
		if !r.Valid() {
			t.Errorf("%q should be valid", r)
		}
	}
	for _, r := range []Reaction{"", "love", "LIKE"} {
		if r.Valid() {
			t.Errorf("reaction %q should be invalid", r)
		}
	}
}

func TestEngagementValidate(t *testing.T) {
	ok := Engagement{Slug: "post", Variant: VariantA, VisitorID: "123e4567-e89b-12d3-a456-426614174000", MaxScrollDepth: 50, DurationSeconds: 1.5}
	if err := ok.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want nil", err)
	}
	for _, d := range []int{0, 100} {
		e := ok
		e.MaxScrollDepth = d
		if err := e.Validate(); err != nil {
			t.Errorf("depth %d: Validate() = %v, want nil", d, err)
		}
	}
	bad := map[string]func(*Engagement){
		"depth -1":      func(e *Engagement) { e.MaxScrollDepth = -1 },
		"depth 101":     func(e *Engagement) { e.MaxScrollDepth = 101 },
		"duration < 0":  func(e *Engagement) { e.DurationSeconds = -0.1 },
		"duration NaN":  func(e *Engagement) { e.DurationSeconds = math.NaN() },
		"duration +Inf": func(e *Engagement) { e.DurationSeconds = math.Inf(1) },
		"variant":       func(e *Engagement) { e.Variant = "C" },
		"slug":          func(e *Engagement) { e.Slug = "Bad Slug" },
		"visitor":       func(e *Engagement) { e.VisitorID = "x" },
	}
	for name, mutate := range bad {
		e := ok
		mutate(&e)
		if err := e.Validate(); err == nil {
			t.Errorf("%s: Validate() = nil, want error", name)
		}
	}
}
