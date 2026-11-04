// Package memory はストアとイベントライタのインメモリ実装。テストと、GCP の設定が無いローカル起動で使う。
package memory

import (
	"context"
	"sync"

	"github.com/asuka1975/abdoc/backend/internal/domain"
)

type variantKey struct {
	slug    string
	variant domain.Variant
}

type visitorKey struct {
	slug      string
	visitorID string
}

// ReactionStore は app.ReactionStore のインメモリ実装。
type ReactionStore struct {
	mu        sync.Mutex
	counts    map[variantKey]domain.Counts
	reactions map[visitorKey]domain.VisitorReaction
}

// NewReactionStore は空の ReactionStore を作る。
func NewReactionStore() *ReactionStore {
	return &ReactionStore{
		counts:    map[variantKey]domain.Counts{},
		reactions: map[visitorKey]domain.VisitorReaction{},
	}
}

// Get は版 v の集計と訪問者の現在のリアクションを返す。
func (s *ReactionStore) Get(_ context.Context, slug, visitorID string, v domain.Variant) (domain.Counts, domain.VisitorReaction, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.counts[variantKey{slug, v}], s.reactions[visitorKey{slug, visitorID}], nil
}

// Update は fn の遷移をロックの中で反映する。
func (s *ReactionStore) Update(_ context.Context, slug, visitorID string, v domain.Variant, fn func(domain.VisitorReaction) domain.Transition) (domain.Transition, domain.Counts, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tr := fn(s.reactions[visitorKey{slug, visitorID}])
	if tr.Changed {
		for variant, d := range tr.Deltas {
			k := variantKey{slug, variant}
			s.counts[k] = s.counts[k].Add(d)
		}
		s.reactions[visitorKey{slug, visitorID}] = tr.Next
	}
	return tr, s.counts[variantKey{slug, v}], nil
}

// EventWriter は app.EventWriter のインメモリ実装。書き込まれたイベントを保持する。
type EventWriter struct {
	mu          sync.Mutex
	reactions   []domain.ReactionEvent
	engagements []domain.Engagement
}

// WriteReaction は e を追記する。
func (w *EventWriter) WriteReaction(_ context.Context, e domain.ReactionEvent) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.reactions = append(w.reactions, e)
	return nil
}

// WriteEngagement は e を追記する。
func (w *EventWriter) WriteEngagement(_ context.Context, e domain.Engagement) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.engagements = append(w.engagements, e)
	return nil
}

// Reactions はこれまでに書かれたリアクションイベントの複製を返す。
func (w *EventWriter) Reactions() []domain.ReactionEvent {
	w.mu.Lock()
	defer w.mu.Unlock()
	return append([]domain.ReactionEvent(nil), w.reactions...)
}

// Engagements はこれまでに書かれた engagement の複製を返す。
func (w *EventWriter) Engagements() []domain.Engagement {
	w.mu.Lock()
	defer w.mu.Unlock()
	return append([]domain.Engagement(nil), w.engagements...)
}
