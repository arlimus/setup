package main

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func press(r rune) tea.KeyPressMsg {
	return tea.KeyPressMsg{Code: r, Text: string(r)}
}

func TestModelNavigation(t *testing.T) {
	m := model{
		branches: []branch{{name: "a"}, {name: "b"}, {name: "c"}},
		cursor:   0,
		width:    80,
		height:   40,
	}

	// down
	r, _ := m.Update(press('j'))
	m = r.(model)
	if m.cursor != 1 {
		t.Errorf("after j: cursor = %d, want 1", m.cursor)
	}

	// down again
	r, _ = m.Update(press('j'))
	m = r.(model)
	if m.cursor != 2 {
		t.Errorf("after j: cursor = %d, want 2", m.cursor)
	}

	// at bottom stays
	r, _ = m.Update(press('j'))
	m = r.(model)
	if m.cursor != 2 {
		t.Errorf("after j at bottom: cursor = %d, want 2", m.cursor)
	}

	// up
	r, _ = m.Update(press('k'))
	m = r.(model)
	if m.cursor != 1 {
		t.Errorf("after k: cursor = %d, want 1", m.cursor)
	}

	// up to top
	r, _ = m.Update(press('k'))
	m = r.(model)
	if m.cursor != 0 {
		t.Errorf("after k: cursor = %d, want 0", m.cursor)
	}

	// at top stays
	r, _ = m.Update(press('k'))
	m = r.(model)
	if m.cursor != 0 {
		t.Errorf("after k at top: cursor = %d, want 0", m.cursor)
	}
}
