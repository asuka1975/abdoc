package memory

import (
	"testing"

	"github.com/asuka1975/abdoc/backend/internal/app"
	"github.com/asuka1975/abdoc/backend/internal/store/storetest"
)

func TestReactionStore(t *testing.T) {
	storetest.Run(t, func(*testing.T) app.ReactionStore { return NewReactionStore() })
}
