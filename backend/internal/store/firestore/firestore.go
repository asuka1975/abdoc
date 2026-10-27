// Package firestore はリアクションのカウンターと訪問者ごとの状態を Firestore に保存する。
//
//	posts/{slug}/variants/{A|B}         { likes, bads }
//	posts/{slug}/reactions/{visitorId}  { variant, reaction }
//
// FIRESTORE_EMULATOR_HOST が設定されていれば、クライアントライブラリが自動でエミュレータへ接続する。
package firestore

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"

	"github.com/asuka1975/abdoc/backend/internal/domain"
)

type countsDoc struct {
	Likes int64 `firestore:"likes"`
	Bads  int64 `firestore:"bads"`
}

type reactionDoc struct {
	Variant  string `firestore:"variant"`
	Reaction string `firestore:"reaction"`
}

// ReactionStore は app.ReactionStore の Firestore 実装。
type ReactionStore struct {
	client *firestore.Client
}

// NewReactionStore は client を使う ReactionStore を作る。client の Close は呼び出し側が行う。
func NewReactionStore(client *firestore.Client) *ReactionStore {
	return &ReactionStore{client: client}
}

func (s *ReactionStore) variantRef(slug string, v domain.Variant) *firestore.DocumentRef {
	return s.client.Collection("posts").Doc(slug).Collection("variants").Doc(string(v))
}

func (s *ReactionStore) reactionRef(slug, visitorID string) *firestore.DocumentRef {
	return s.client.Collection("posts").Doc(slug).Collection("reactions").Doc(visitorID)
}

// Get は版 v の集計と訪問者の現在のリアクションを返す。ドキュメントが無ければゼロ値。
func (s *ReactionStore) Get(ctx context.Context, slug, visitorID string, v domain.Variant) (domain.Counts, domain.VisitorReaction, error) {
	snaps, err := s.client.GetAll(ctx, []*firestore.DocumentRef{s.variantRef(slug, v), s.reactionRef(slug, visitorID)})
	if err != nil {
		return domain.Counts{}, domain.VisitorReaction{}, fmt.Errorf("firestore get: %w", err)
	}
	counts, err := decodeCounts(snaps[0])
	if err != nil {
		return domain.Counts{}, domain.VisitorReaction{}, err
	}
	cur, err := decodeReaction(snaps[1])
	if err != nil {
		return domain.Counts{}, domain.VisitorReaction{}, err
	}
	return counts, cur, nil
}

// Update は 1 つのトランザクションで訪問者の状態と、影響する版のカウンターを更新する。
func (s *ReactionStore) Update(ctx context.Context, slug, visitorID string, v domain.Variant, fn func(domain.VisitorReaction) domain.Transition) (domain.Transition, domain.Counts, error) {
	var (
		tr     domain.Transition
		result domain.Counts
	)
	err := s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		// 読み取りはすべて書き込みより前に行う。両方の版を読んでおけば、付け替えでも追加の読み取りは要らない。
		refs := []*firestore.DocumentRef{
			s.reactionRef(slug, visitorID),
			s.variantRef(slug, domain.VariantA),
			s.variantRef(slug, domain.VariantB),
		}
		snaps, err := tx.GetAll(refs)
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}
		cur, err := decodeReaction(snaps[0])
		if err != nil {
			return err
		}
		counts := map[domain.Variant]domain.Counts{}
		for i, variant := range []domain.Variant{domain.VariantA, domain.VariantB} {
			if counts[variant], err = decodeCounts(snaps[i+1]); err != nil {
				return err
			}
		}

		tr = fn(cur)
		if tr.Changed {
			for variant, d := range tr.Deltas {
				counts[variant] = counts[variant].Add(d)
				c := counts[variant]
				if err := tx.Set(s.variantRef(slug, variant), countsDoc{Likes: c.Likes, Bads: c.Bads}); err != nil {
					return fmt.Errorf("write counts: %w", err)
				}
			}
			next := reactionDoc{Variant: string(tr.Next.Variant), Reaction: string(tr.Next.Reaction)}
			if err := tx.Set(refs[0], next); err != nil {
				return fmt.Errorf("write reaction: %w", err)
			}
		}
		result = counts[v]
		return nil
	})
	if err != nil {
		return domain.Transition{}, domain.Counts{}, fmt.Errorf("firestore transaction: %w", err)
	}
	return tr, result, nil
}

func decodeCounts(snap *firestore.DocumentSnapshot) (domain.Counts, error) {
	if !snap.Exists() {
		return domain.Counts{}, nil
	}
	var d countsDoc
	if err := snap.DataTo(&d); err != nil {
		return domain.Counts{}, fmt.Errorf("decode %s: %w", snap.Ref.Path, err)
	}
	return domain.Counts{Likes: d.Likes, Bads: d.Bads}, nil
}

func decodeReaction(snap *firestore.DocumentSnapshot) (domain.VisitorReaction, error) {
	if !snap.Exists() {
		return domain.VisitorReaction{}, nil
	}
	var d reactionDoc
	if err := snap.DataTo(&d); err != nil {
		return domain.VisitorReaction{}, fmt.Errorf("decode %s: %w", snap.Ref.Path, err)
	}
	return domain.VisitorReaction{Variant: domain.Variant(d.Variant), Reaction: domain.Reaction(d.Reaction)}, nil
}
