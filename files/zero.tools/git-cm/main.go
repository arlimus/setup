package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type commitType struct {
	emoji string
	label string
}

var commitTypes = []commitType{
	{"✨", "small feature"},
	{"⭐", "medium feature"},
	{"🌟", "major feature"},
	{"🧹", "clean-up"},
	{"🐛", "bugfix"},
	{"🍉", "ui feature"},
	{"🌈", "ux / design"},
	{"🏇", "speed / race condition"},
	{"🛑", "breaking feature"},
	{"🟢", "get tests green"},
}

const (
	fieldType  = 0
	fieldTitle = 1
	fieldBody  = 2
)

type model struct {
	field       int
	typeIdx     int
	title       textinput.Model
	body        textarea.Model
	err         string
	done        bool
	committed   bool
	commitMsg   string
	width       int
	height      int
}

func initialModel() model {
	ti := textinput.New()
	ti.Placeholder = "commit title (required)"
	ti.CharLimit = 120
	ti.Width = 60

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

	case tea.KeyMsg:
		// Global quit
		switch msg.String() {
		case "ctrl+c", "esc":
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

func (m model) updateType(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.typeIdx > 0 {
			m.typeIdx--
		}
	case "down", "j":
		if m.typeIdx < len(commitTypes)-1 {
			m.typeIdx++
		} else {
			m.field = fieldTitle
			m.title.Focus()
			return m, textinput.Blink
		}
	case "enter":
		m.field = fieldTitle
		m.title.Focus()
		return m, textinput.Blink
	}
	return m, nil
}

func (m model) updateTitle(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up":
		m.title.Blur()
		m.field = fieldType
		return m, nil
	case "down", "enter":
		m.title.Blur()
		m.field = fieldBody
		m.body.Focus()
		return m, textarea.Blink
	default:
		var cmd tea.Cmd
		m.title, cmd = m.title.Update(msg)
		return m, cmd
	}
}

func (m model) updateBody(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up":
		// If cursor is on the first line, navigate to title
		if m.body.Line() == 0 {
			m.body.Blur()
			m.field = fieldTitle
			m.title.Focus()
			return m, textinput.Blink
		}
		var cmd tea.Cmd
		m.body, cmd = m.body.Update(msg)
		return m, cmd
	case "enter":
		// Enter confirms (even if empty)
		m.body.Blur()
		return m.doCommit()
	case "shift+enter", "alt+enter":
		// Insert newline
		m.body.InsertString("\n")
		return m, nil
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
		m.title.Focus()
		return m, textinput.Blink
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
	dimStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	errStyle      = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("9"))
	cursorStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
)

func (m model) View() string {
	if m.done {
		return ""
	}

	var b strings.Builder

	// Type selector
	b.WriteString(labelStyle.Render("Type") + "\n")
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

	b.WriteString("\n" + dimStyle.Render("enter: confirm • esc: cancel") + "\n")

	return b.String()
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
