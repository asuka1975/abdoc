package domain

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"time"
)

// ErrInvalid は入力が不正なことを表す。transport 層で 400 に変換する。
var ErrInvalid = errors.New("invalid input")

// Variant は記事の版（A / B）。
type Variant string

const (
	VariantA Variant = "A"
	VariantB Variant = "B"
)

// Valid は v が既知の版かを返す。
func (v Variant) Valid() bool { return v == VariantA || v == VariantB }

// Reaction は訪問者のリアクション。none は「押していない」。
type Reaction string

const (
	ReactionLike Reaction = "like"
	ReactionBad  Reaction = "bad"
	ReactionNone Reaction = "none"
)

// Valid は r が既知のリアクションかを返す。
func (r Reaction) Valid() bool {
	return r == ReactionLike || r == ReactionBad || r == ReactionNone
}

var (
	slugPattern      = regexp.MustCompile(`^[a-z0-9-]{1,100}$`)
	visitorIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// ValidSlug は slug が `^[a-z0-9-]{1,100}$` に合うかを返す（記事の存在は確かめない）。
func ValidSlug(s string) bool { return slugPattern.MatchString(s) }

// ValidVisitorID は id がハイフン区切りの UUID の形式かを返す（期限は確かめない）。
func ValidVisitorID(id string) bool { return visitorIDPattern.MatchString(id) }

// Counts は版ごとのいいね数・バッド数。
type Counts struct {
	Likes int64
	Bads  int64
}

// Delta は Counts の増減。
type Delta struct {
	Likes int64
	Bads  int64
}

// Add は d を足した Counts を返す。データの不整合があっても負にはしない。
func (c Counts) Add(d Delta) Counts {
	return Counts{Likes: max(c.Likes+d.Likes, 0), Bads: max(c.Bads+d.Bads, 0)}
}

// VisitorReaction は訪問者 1 人・記事 1 件についての現在のリアクション（最大 1 つ）。
// 記録が無いときはゼロ値（Reaction が空）で、none と同じに扱う。
type VisitorReaction struct {
	Variant  Variant
	Reaction Reaction
}

func (vr VisitorReaction) active() bool {
	return vr.Reaction == ReactionLike || vr.Reaction == ReactionBad
}

// For は版 v を表示している訪問者から見た自分のリアクションを返す。
// 別の版に付けたリアクションは none に見える。
func (vr VisitorReaction) For(v Variant) Reaction {
	if vr.active() && vr.Variant == v {
		return vr.Reaction
	}
	return ReactionNone
}

// Transition は Apply の結果。
type Transition struct {
	Prev    VisitorReaction
	Next    VisitorReaction
	Deltas  map[Variant]Delta
	Changed bool
}

// Apply は現在の状態 cur で、版 variant を表示している訪問者が press を設定したときの遷移を返す。
// いいねとバッドは排他で、後から設定した方が有効。版が変わったら前の版から外して variant へ付け替える。
// none はどの版に付いていても外す。同じ状態の再設定では何も変わらない（冪等）。
func Apply(cur VisitorReaction, variant Variant, press Reaction) Transition {
	tr := Transition{Prev: cur, Next: cur, Deltas: map[Variant]Delta{}}
	if press == ReactionNone {
		if !cur.active() {
			return tr
		}
	} else if cur.active() && cur.Variant == variant && cur.Reaction == press {
		return tr
	}

	if cur.active() {
		tr.Deltas[cur.Variant] = addReaction(tr.Deltas[cur.Variant], cur.Reaction, -1)
	}
	if press != ReactionNone {
		tr.Deltas[variant] = addReaction(tr.Deltas[variant], press, +1)
	}
	tr.Next = VisitorReaction{Variant: variant, Reaction: press}
	tr.Changed = true
	return tr
}

func addReaction(d Delta, r Reaction, n int64) Delta {
	switch r {
	case ReactionLike:
		d.Likes += n
	case ReactionBad:
		d.Bads += n
	}
	return d
}

// ReactionState は版ごとの集計と、訪問者自身のリアクション。
type ReactionState struct {
	Counts
	MyReaction Reaction
}

// ReactionEvent はリアクションが変わったときに 1 行記録するイベント。
type ReactionEvent struct {
	Slug             string
	Variant          Variant
	VisitorID        string
	Reaction         Reaction
	PreviousReaction Reaction
	Timestamp        time.Time
}

// Engagement はスクロール深さと滞在時間の記録。
type Engagement struct {
	Slug            string
	Variant         Variant
	VisitorID       string
	MaxScrollDepth  int
	DurationSeconds float64
	Timestamp       time.Time
}

// Validate は e の各値を検証する（Timestamp は見ない）。
func (e Engagement) Validate() error {
	if err := ValidateTarget(e.Slug, e.VisitorID, e.Variant); err != nil {
		return err
	}
	if e.MaxScrollDepth < 0 || e.MaxScrollDepth > 100 {
		return fmt.Errorf("%w: maxScrollDepth must be 0..100", ErrInvalid)
	}
	if math.IsNaN(e.DurationSeconds) || math.IsInf(e.DurationSeconds, 0) || e.DurationSeconds < 0 {
		return fmt.Errorf("%w: durationSeconds must be >= 0", ErrInvalid)
	}
	return nil
}

// ValidateTarget は slug・訪問者 ID・版を検証する。
func ValidateTarget(slug, visitorID string, v Variant) error {
	if !ValidSlug(slug) {
		return fmt.Errorf("%w: slug", ErrInvalid)
	}
	if !ValidVisitorID(visitorID) {
		return fmt.Errorf("%w: visitor id", ErrInvalid)
	}
	if !v.Valid() {
		return fmt.Errorf("%w: variant", ErrInvalid)
	}
	return nil
}
