package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"charm.land/bubbles/v2/textarea"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type commitType struct {
	emoji string
	label string
}

var commitTypes = []commitType{
	{"✨", "small feature (sparkles)"},
	{"⭐", "medium feature (star)"},
	{"🌟", "major feature (bright star)"},
	{"🧹", "clean-up (broom)"},
	{"🐛", "bugfix"},
	{"🍉", "ui feature (melon)"},
	{"🌈", "ux / design (rainbow)"},
	{"🏇", "speed / race condition (horse)"},
	{"🛑", "breaking feature (stop)"},
	{"🟢", "get tests green"},
	{"🍫", "examples (choco)"},
}

const (
	fieldType  = 0
	fieldTitle = 1
	fieldBody  = 2
)

type model struct {
	field      int
	typeIdx    int
	typeSearch string
	title      textinput.Model
	body       textarea.Model
	err        string
	done       bool
	committed  bool
	commitMsg  string
	width      int
	height     int
}

func initialModel() model {
	ti := textinput.New()
	ti.Placeholder = "commit title (required)"
	ti.CharLimit = 120
	ti.SetWidth(60)

	ta := textarea.New()
	ta.Placeholder = "commit body (optional, enter to confirm)"
	ta.SetWidth(62)
	ta.SetHeight(5)
	ta.CharLimit = 0

	return model{
		field:   fieldType,
		typeIdx: 0,
		title:   ti,
		body:    ta,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyPressMsg:
		key := msg.Key()
		if key.Code == 'c' && key.Mod.Contains(tea.ModCtrl) {
			return m, tea.Quit
		}

		switch m.field {
		case fieldType:
			return m.updateType(msg)
		case fieldTitle:
			return m.updateTitle(msg)
		case fieldBody:
			return m.updateBody(msg)
		}
	}

	return m, nil
}

func (m model) updateType(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	key := msg.Key()
	switch key.Code {
	case tea.KeyEscape:
		if m.typeSearch != "" {
			m.typeSearch = ""
		} else {
			return m, tea.Quit
		}
	case 'w':
		if key.Mod.Contains(tea.ModCtrl) {
			m.typeSearch = ""
		} else {
			m.appendSearch(key)
		}
	case tea.KeyUp:
		if m.typeIdx > 0 {
			m.typeIdx--
		}
		m.typeSearch = ""
	case tea.KeyDown:
		if m.typeIdx < len(commitTypes)-1 {
			m.typeIdx++
		} else {
			m.field = fieldTitle
			cmd := m.title.Focus()
			m.typeSearch = ""
			return m, cmd
		}
		m.typeSearch = ""
	case tea.KeyEnter:
		m.field = fieldTitle
		cmd := m.title.Focus()
		m.typeSearch = ""
		return m, cmd
	case tea.KeyBackspace:
		if len(m.typeSearch) > 0 {
			m.typeSearch = m.typeSearch[:len(m.typeSearch)-1]
		}
	default:
		m.appendSearch(key)
	}
	return m, nil
}

func (m *model) appendSearch(key tea.Key) {
	if key.Text != "" {
		m.typeSearch += key.Text
		query := strings.ToLower(m.typeSearch)
		for i, ct := range commitTypes {
			if strings.Contains(strings.ToLower(ct.label), query) {
				m.typeIdx = i
				break
			}
		}
	}
}

func (m model) updateTitle(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	key := msg.Key()
	switch key.Code {
	case tea.KeyEscape, tea.KeyUp:
		m.title.Blur()
		m.field = fieldType
		return m, nil
	case tea.KeyDown, tea.KeyEnter:
		m.title.Blur()
		m.field = fieldBody
		cmd := m.body.Focus()
		return m, cmd
	default:
		var cmd tea.Cmd
		m.title, cmd = m.title.Update(msg)
		return m, cmd
	}
}

func (m model) updateBody(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	key := msg.Key()
	switch key.Code {
	case tea.KeyEscape:
		m.body.Blur()
		m.field = fieldTitle
		cmd := m.title.Focus()
		return m, cmd
	case tea.KeyUp:
		if m.body.Line() == 0 {
			m.body.Blur()
			m.field = fieldTitle
			cmd := m.title.Focus()
			return m, cmd
		}
		var cmd tea.Cmd
		m.body, cmd = m.body.Update(msg)
		return m, cmd
	case tea.KeyEnter:
		if key.Mod.Contains(tea.ModShift) || key.Mod.Contains(tea.ModAlt) {
			m.body.InsertString("\n")
			return m, nil
		}
		// Plain enter confirms
		m.body.Blur()
		return m.doCommit()
	default:
		var cmd tea.Cmd
		m.body, cmd = m.body.Update(msg)
		return m, cmd
	}
}

func (m model) doCommit() (tea.Model, tea.Cmd) {
	title := strings.TrimSpace(m.title.Value())
	if title == "" {
		m.err = "title cannot be empty"
		m.field = fieldTitle
		cmd := m.title.Focus()
		return m, cmd
	}

	ct := commitTypes[m.typeIdx]
	subject := fmt.Sprintf("%s %s", ct.emoji, title)

	body := strings.TrimSpace(m.body.Value())
	var commitMsg string
	if body != "" {
		commitMsg = subject + "\n\n" + body
	} else {
		commitMsg = subject
	}

	m.commitMsg = commitMsg
	m.done = true
	m.committed = true
	return m, tea.Quit
}

var (
	labelStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12"))
	selectedStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("10"))
	dimStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	errStyle      = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("9"))
	cursorStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
)

func (m model) View() tea.View {
	if m.done {
		return tea.NewView("")
	}

	var b strings.Builder

	// Type selector
	if m.field == fieldType && m.typeSearch != "" {
		b.WriteString(labelStyle.Render("Type") + " " + dimStyle.Render("search: ") + m.typeSearch + "\n")
	} else {
		b.WriteString(labelStyle.Render("Type") + "\n")
	}
	for i, ct := range commitTypes {
		cursor := "  "
		style := dimStyle
		if i == m.typeIdx {
			cursor = cursorStyle.Render("▸ ")
			if m.field == fieldType {
				style = selectedStyle
			} else {
				style = lipgloss.NewStyle()
			}
		}
		b.WriteString(fmt.Sprintf("%s%s\n", cursor, style.Render(ct.emoji+" "+ct.label)))
	}

	b.WriteString("\n")

	// Title
	b.WriteString(labelStyle.Render("Title") + "\n")
	b.WriteString(m.title.View() + "\n\n")

	// Body
	b.WriteString(labelStyle.Render("Body") + " " + dimStyle.Render("(shift+enter for newline)") + "\n")
	b.WriteString(m.body.View() + "\n")

	if m.err != "" {
		b.WriteString("\n" + errStyle.Render(m.err) + "\n")
	}

	b.WriteString("\n" + dimStyle.Render("enter: confirm • esc: back") + "\n")

	return tea.NewView(b.String())
}

func main() {
	m := initialModel()
	p := tea.NewProgram(m)

	finalModel, err := p.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fm := finalModel.(model)
	if !fm.committed {
		os.Exit(0)
	}

	cmd := exec.Command("git", "commit", "-m", fm.commitMsg)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "git commit failed: %v\n", err)
		os.Exit(1)
	}
}
