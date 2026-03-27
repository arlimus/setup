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

func TestUndoStack(t *testing.T) {
	a := branch{name: "a", commits: []commit{{hash: "aa", title: "a1", merged: true}}}
	b := branch{name: "b", commits: []commit{{hash: "bb", title: "b1"}}}
	c := branch{name: "c"}

	m := model{
		branches: []branch{a, b, c},
		cursor:   1,
		width:    80,
		height:   40,
	}

	// simulate delete of "b" at index 1
	m.undos = append(m.undos, deleted{branch: b, sha: "deadbeef", index: 1})
	m.branches = append(m.branches[:1], m.branches[2:]...)
	m.msg = "deleted b"

	if len(m.branches) != 2 {
		t.Fatalf("after delete: len = %d, want 2", len(m.branches))
	}
	if m.branches[0].name != "a" || m.branches[1].name != "c" {
		t.Errorf("after delete: branches = %v", branchNames(m.branches))
	}

	// simulate undo: re-insert at saved index
	last := m.undos[len(m.undos)-1]
	m.undos = m.undos[:len(m.undos)-1]
	idx := last.index
	if idx > len(m.branches) {
		idx = len(m.branches)
	}
	m.branches = append(m.branches[:idx], append([]branch{last.branch}, m.branches[idx:]...)...)
	m.cursor = idx

	if len(m.branches) != 3 {
		t.Fatalf("after undo: len = %d, want 3", len(m.branches))
	}
	if m.branches[1].name != "b" {
		t.Errorf("after undo: branches = %v, want b at index 1", branchNames(m.branches))
	}
	if m.cursor != 1 {
		t.Errorf("after undo: cursor = %d, want 1", m.cursor)
	}
	if len(m.undos) != 0 {
		t.Errorf("after undo: undo stack len = %d, want 0", len(m.undos))
	}
}

func TestUndoInsertAtEnd(t *testing.T) {
	// delete last branch, then undo — index should clamp
	m := model{
		branches: []branch{{name: "a"}},
		cursor:   0,
		width:    80,
		height:   40,
		undos:    []deleted{{branch: branch{name: "b"}, sha: "abc", index: 5}},
	}

	last := m.undos[0]
	m.undos = nil
	idx := last.index
	if idx > len(m.branches) {
		idx = len(m.branches)
	}
	m.branches = append(m.branches[:idx], append([]branch{last.branch}, m.branches[idx:]...)...)
	m.cursor = idx

	if len(m.branches) != 2 {
		t.Fatalf("len = %d, want 2", len(m.branches))
	}
	if m.branches[1].name != "b" {
		t.Errorf("branches = %v, want b at end", branchNames(m.branches))
	}
	if m.cursor != 1 {
		t.Errorf("cursor = %d, want 1", m.cursor)
	}
}

func branchNames(bs []branch) []string {
	names := make([]string, len(bs))
	for i, b := range bs {
		names[i] = b.name
	}
	return names
}
