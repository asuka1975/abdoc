package app

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/asuka1975/abdoc/backend/internal/domain"
)

// ReactionStore はリアクションのカウンターと訪問者ごとの状態を永続化する。
type ReactionStore interface {
	// Get は slug の版 v の集計と、訪問者 visitorID の現在のリアクションを返す。記録が無ければゼロ値。
	Get(ctx context.Context, slug, visitorID string, v domain.Variant) (domain.Counts, domain.VisitorReaction, error)
	// Update は 1 つのトランザクションで訪問者の現在の状態を読み、fn の遷移を反映する。
	// fn は再試行で複数回呼ばれることがある。戻り値は最終的な遷移と、反映後の版 v の集計。
	Update(ctx context.Context, slug, visitorID string, v domain.Variant, fn func(cur domain.VisitorReaction) domain.Transition) (domain.Transition, domain.Counts, error)
}

// EventWriter は分析用のイベントを書き込む（BigQuery）。
type EventWriter interface {
	WriteReaction(ctx context.Context, e domain.ReactionEvent) error
	WriteEngagement(ctx context.Context, e domain.Engagement) error
}

// Service はリアクションと engagement のユースケース。
type Service struct {
	store  ReactionStore
	events EventWriter
	logger *slog.Logger
	now    func() time.Time
}

// NewService は Service を作る。
func NewService(store ReactionStore, events EventWriter, logger *slog.Logger) *Service {
	return &Service{store: store, events: events, logger: logger, now: time.Now}
}

// GetReaction は版 v の集計と、訪問者から見た自分のリアクションを返す。
func (s *Service) GetReaction(ctx context.Context, slug, visitorID string, v domain.Variant) (domain.ReactionState, error) {
	if err := domain.ValidateTarget(slug, visitorID, v); err != nil {
		return domain.ReactionState{}, err
	}
	counts, cur, err := s.store.Get(ctx, slug, visitorID, v)
	if err != nil {
		return domain.ReactionState{}, fmt.Errorf("get reaction: %w", err)
	}
	return domain.ReactionState{Counts: counts, MyReaction: cur.For(v)}, nil
}

// SetReaction は訪問者のリアクションを r にする。変化があったときだけイベントを書く。
func (s *Service) SetReaction(ctx context.Context, slug, visitorID string, v domain.Variant, r domain.Reaction) (domain.ReactionState, error) {
	if err := domain.ValidateTarget(slug, visitorID, v); err != nil {
		return domain.ReactionState{}, err
	}
	if !r.Valid() {
		return domain.ReactionState{}, fmt.Errorf("%w: reaction", domain.ErrInvalid)
	}
	tr, counts, err := s.store.Update(ctx, slug, visitorID, v, func(cur domain.VisitorReaction) domain.Transition {
		return domain.Apply(cur, v, r)
	})
	if err != nil {
		return domain.ReactionState{}, fmt.Errorf("update reaction: %w", err)
	}
	if tr.Changed {
		ev := domain.ReactionEvent{
			Slug:             slug,
			Variant:          v,
			VisitorID:        visitorID,
			Reaction:         r,
			PreviousReaction: tr.Prev.For(tr.Prev.Variant),
			Timestamp:        s.now().UTC(),
		}
		// カウンター（Firestore）が正。イベントの書き込みに失敗してもリアクション自体は成功として返す。
		if err := s.events.WriteReaction(ctx, ev); err != nil {
			s.logger.ErrorContext(ctx, "failed to write reaction event", slog.Any("error", err), slog.String("slug", slug))
		}
	}
	return domain.ReactionState{Counts: counts, MyReaction: tr.Next.For(v)}, nil
}

// RecordEngagement は engagement を 1 行記録する（重複排除は集計側で行う）。
func (s *Service) RecordEngagement(ctx context.Context, e domain.Engagement) error {
	if err := e.Validate(); err != nil {
		return err
	}
	e.Timestamp = s.now().UTC()
	if err := s.events.WriteEngagement(ctx, e); err != nil {
		return fmt.Errorf("write engagement: %w", err)
	}
	return nil
}
